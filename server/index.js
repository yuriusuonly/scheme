/**
 * @module server
 * Composition root — wires every microservice together and boots Bun.
 *
 * This is the ONLY module that knows the whole application graph:
 *   - reads the centralized configuration (server/internal/configuration/)
 *   - initialises persistence (database + repositories)
 *   - creates the event bus
 *   - creates each microservice (authentication, synchronization,
 *     queries, streaming, health), injecting only what each
 *     service needs
 *   - opens the single always-on snapshot database and passes it to the
 *     queries service, which mirrors every sandbox mutation onto it first
 *   - hosts the application container (`setApplication` / `getApplication`)
 *     that SSR helpers and page handlers use to reach the services
 *   - injects services into the middleware (authenticator factory)
 *   - creates the fully-wired router (internal/router) — every REST
 *     endpoint and every server-rendered page in one module
 *   - serves server-rendered pages from server/external/ (route-scoped
 *     component directories)
 *   - serves the generated empty-body shell + static favicon
 *   - boots Bun with a disabled idle timeout so SSE streams stay open
 *
 * Services never import one another — the event bus is their only channel.
 *
 * The graph is assembled exactly once at boot: the composition root opens the
 * live database and the single always-on snapshot database, builds the
 * services, the router, and the middleware stack, and boots the Bun HTTP
 * server. There is no runtime rebuild path — a manual snapshot restore is a
 * file copy performed with the server stopped, after which the next boot
 * reopens and re-migrates the restored database.
 *
 * Usage:
 *   bun run server/index.js             # Start the server
 *   bun --watch run server/index.js     # Development with hot reload
 */

import { initializeDatabase, openSnapshotDatabase } from "./internal/persistence/database.js";
import { createRepositories } from "./internal/persistence/repositories.js";
import { createEventBus } from "./internal/services/event_bus.js";
import { createAuthenticationService } from "./internal/services/authentication.js";
import { createSynchronizationService } from "./internal/services/synchronization.js";
import { createQueriesService } from "./internal/services/queries.js";
import { createStreamingService } from "./internal/services/streaming.js";
import { createHealthService } from "./internal/services/health.js";
import { hashPassword } from "./internal/security/hash_password.js";
import { generateToken } from "./internal/security/generate_token.js";
import { createRouter } from "./internal/router/create_router.js";
import { createContext } from "./internal/middleware/context.js";
import { pipeline } from "./internal/middleware/pipeline.js";
import { corsMiddleware } from "./internal/middleware/cors.js";
import { jsonBodyMiddleware } from "./internal/middleware/body_parser.js";
import { loggerMiddleware } from "./internal/middleware/logger.js";
import { errorBoundaryMiddleware } from "./internal/middleware/error_boundary.js";
import { createAuthenticatorMiddleware } from "./internal/middleware/authenticator.js";
import { configuration } from "./internal/configuration/environment.js";
import { joinPath } from "./internal/configuration/join_path.js";
import { pageLayout } from "./external/_/helpers/html.js";

// ---------------------------------------------------------------------------
// Application container — the shared service registry.
//
// The composition root assembles every microservice and registers the
// application here once at boot.
// External SSR helpers (e.g. server/external/_/helpers/user.js) and page
// handlers reach the services through `getApplication()` without importing
// internal modules directly or being force-fed dependencies through every
// page signature.
// ---------------------------------------------------------------------------

let application = null;

/**
 * Register the fully-assembled application.
 * @param {object} value  { services, repositories, eventBus }
 */
function setApplication(value) {
  application = value;
}

/**
 * Return the registered application.
 * @returns {{ services: object, repositories: object, eventBus: object }}
 * @throws {Error} when called before boot completes
 */
export function getApplication() {
  if (!application) throw new Error("Application not initialised — call setApplication() first.");
  return application;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const boot = async () => {
  // --- Persistence ---------------------------------------------------------
  // Migrations only — the database is never seeded. Fresh installs start
  // empty and the first account is created through /register. The single
  // always-on snapshot database is opened right after: it is seeded from the
  // live database with VACUUM INTO the first time it appears, then opened in
  // place — every sandbox mutation is mirrored there first (queries service).
  const database = await initializeDatabase(configuration.dbPath);
  const snapshotDatabase = await openSnapshotDatabase(configuration.snapshotPath, database);
  const repositories = createRepositories(database);

  // --- Event bus + microservices ------------------------------------------
  // Services never import one another — the event bus is their only channel.
  const eventBus = createEventBus();

  const authentication = createAuthenticationService({
    repositories,
    hashPassword,
    generateToken,
    sessionTtlSeconds: configuration.sessionTtlSeconds,
  });
  const synchronization = createSynchronizationService({ repositories, eventBus });
  const queries = createQueriesService({ database, snapshotDatabase, eventBus });
  const streaming = createStreamingService({ eventBus });
  const health = createHealthService();

  const services = { authentication, synchronization, queries, streaming, health };
  setApplication({ services, repositories, eventBus });

  // --- Router -------------------------------------------------------------
  // The router registers every REST endpoint and loads every page at
  // assembly time — one module (internal/router) owns the whole routing graph.
  const router = await createRouter({
    services,
    pagesDirectory: configuration.pagesDirectory,
  });

  // --- Middleware ----------------------------------------------------------
  // The top-level error boundary wraps everything so thrown HttpErrors become
  // JSON responses; cors → body → logger → authenticator run before handlers.
  // The authenticator factory binds the authentication service built above.
  const apiStack = [
    errorBoundaryMiddleware,
    corsMiddleware,
    jsonBodyMiddleware,
    loggerMiddleware,
    createAuthenticatorMiddleware(authentication),
  ];

  const pageList = router.listPages().join(", ") || "(none)";

  async function handleRequest(request, server) {
    // CORS preflight.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": configuration.corsOrigin,
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    // Resolve the client address once per request so HTTP adapters can record
    // request provenance (e.g. the SQL sandbox audit trail) without reaching
    // into the Bun server object themselves.
    const remoteAddress = server && typeof server.requestIP === "function" ? server.requestIP(request)?.address || null : null;

    // --- Server-rendered pages + REST API (unified router) ----------------
    // `router` and `apiStack` are locals of the `boot` closure, captured by
    // this handler at definition time and immutable after boot completes.
    const matched = router.match(request.method, url.pathname);
    if (matched) {
      if (matched.type === "page") {
        // Page handlers render full documents; only the context is injected.
        return matched.handler(createContext(request, { remoteAddress }));
      }
      if (matched.type === "api") {
        const run = pipeline(apiStack, async (context) => {
          context.params = matched.params;
          return matched.handler(context);
        });
        return run(createContext(request, { remoteAddress }));
      }
    }

    // --- SPA shell + static assets -----------------------------------------
    return serveClient(url, request);
  }

  // -------------------------------------------------------------------------
  // Generated empty-body shell + static assets.
  //
  // The page HTML carries everything embedded: the core client runtime is
  // inlined into the <head> as a <script type="module"> block (see
  // server/external/_/helpers/html.js + core.js), the base layout lives in
  // server/external/_/components/container, and each component carries its own
  // local <style>/<script> blocks. The empty body shell is generated here for
  // fallback routes and then hydrated by the embedded core runtime (fetch +
  // DOM injection). Only the favicon ships as a real static file.
  // -------------------------------------------------------------------------

  function renderShell() {
    return new Response(pageLayout({ title: "Scheme — SQL Training Ground", body: "" }), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  async function serveClient(url, request) {
    if (url.pathname.startsWith("/api/")) {
      return new Response("{\"error\":\"API endpoint not found\"}", {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Favicon and other static assets.
    if (url.pathname.startsWith("/assets/")) {
      const filePath = joinPath(configuration.assetsDirectory, url.pathname.slice("/assets/".length));
      if (!filePath.startsWith(configuration.assetsDirectory + "/")) {
        return new Response("Forbidden", { status: 403 });
      }
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Cache-Control": "public, max-age=3600" },
        });
      }
      return new Response("Not Found", { status: 404 });
    }

    // Fallback: the empty shell served once. The embedded core runtime fetches
    // the server-rendered dashboard page and injects the body in place (SSR
    // hydration). A bare `/` request redirects to /dashboard.
    if (request.method === "GET") {
      if (url.pathname === "/") {
        return Response.redirect(new URL("/dashboard", request.url).toString(), 302);
      }
      return renderShell();
    }

    return new Response("Not Found", { status: 404 });
  }

  // -------------------------------------------------------------------------
  // Boot banner + heartbeat + server
  // -------------------------------------------------------------------------

  console.log(`
┌─────────────────────────────────────────┐
│                                         │
│   Scheme — SQL Training Ground          │
│                                         │
│   http://${configuration.host}:${configuration.port}                  │
│                                         │
│   Pages:    ${pageList.padEnd(25)}│
│   Database: ${(configuration.dbPath.length > 24 ? "…" + configuration.dbPath.slice(-24) : configuration.dbPath).padEnd(25)}│
│   SSE:      http://${configuration.host}:${configuration.port}/api/events│
│                                         │
│   First account: /register              │
│                                         │
└─────────────────────────────────────────┘
`);

  // Heartbeat for idle SSE connections — protects against proxy timeouts.
  // This is the only place the keep-alive is started; the streaming service's
  // module-scoped timer guard makes a second start a no-op.
  services.streaming.startKeepAlive(15000);

  const server = Bun.serve({
    port: configuration.port,
    hostname: configuration.host,
    // SSE streams stay open indefinitely — Bun's default 10s idle timeout
    // would otherwise kill an event stream with no recent traffic.
    idleTimeout: 0,
    fetch: handleRequest,
  });

  console.log(`Server running on http://${server.hostname}:${server.port}`);
};

boot();