/**
 * @module internal/router/adapters
 * REST API adapters for every `/api/*` endpoint.
 *
 * Each adapter is a thin HTTP layer over a microservice use-case: it reads the
 * request from the context, calls the service, and maps the result (or thrown
 * HttpError) to an HTTP response. Domain logic and event publishing stay in
 * the services — adapters never import repositories or the event bus.
 */

/**
 * Parameterised body reader with a consistent empty-object default.
 * @param {object} context
 * @returns {object}
 */
function readBody(context) {
  return context.state.body || {};
}

/**
 * Register every REST API endpoint onto the provided engine `add` function.
 * @param {object} dependencies
 * @param {Function} dependencies.add       engine.add(method, pattern, handler)
 * @param {object} dependencies.services    { authentication, synchronization, queries, streaming, health }
 */
export function registerApiAdapters({ add, services }) {
  const { authentication, synchronization, queries, streaming, health } = services;

  // Health
  add("GET", "/api/health", (context) => {
    return context.json(health.report());
  });

  // Authentication — /api/authentication/*
  add("POST", "/api/authentication/register", async (context) => {
    const body = readBody(context);
    const result = await authentication.register({
      username: body.username,
      password: body.password,
    });
    return context.json(result, 201);
  });

  add("POST", "/api/authentication/login", async (context) => {
    const body = readBody(context);
    const result = await authentication.login({
      username: body.username,
      password: body.password,
    });
    return context.json(result);
  });

  add("POST", "/api/authentication/logout", (context) => {
    const authorization = context.request.headers.get("authorization");
    authentication.logout(authorization);
    return context.json({ ok: true });
  });

  add("GET", "/api/authentication/me", (context) => {
    const session = context.state.session || null;
    const user = authentication.me(session);
    return context.json({ user });
  });

  // Synchronization — /api/synchronization/*
  add("GET", "/api/synchronization/pending", (context) => {
    return context.json({ entries: synchronization.pending() });
  });

  add("POST", "/api/synchronization/acknowledge", (context) => {
    const body = readBody(context);
    const acknowledged = synchronization.acknowledge(body.ids || []);
    return context.json({ acknowledged });
  });

  // Queries — the SQL training-ground API
  add("GET", "/api/schema", (context) => {
    return context.json(queries.listSchema());
  });

  add("GET", "/api/data/:table", (context) => {
    const limit = Number(context.url.searchParams.get("limit")) || undefined;
    return context.json(queries.listTableData(context.params.table, limit));
  });

  add("POST", "/api/queries", (context) => {
    const body = readBody(context);
    const session = context.state.session || null;
    return context.json(
      queries.execute(
        body.sql,
        {
          userId: session ? session.userId : null,
          sourceIp: context.remoteAddress,
          userAgent: context.request.headers.get("user-agent") || null,
        },
        // Optional client-supplied request id. When present it is reused as
        // the mutation id, so the acting browser can recognize its own SSE
        // echo immediately (before its POST even resolves) instead of racing
        // the broadcast order. Any string up to 64 chars is accepted.
        typeof body.clientId === "string" ? body.clientId : null
      )
    );
  });

  // Server-Sent Events — live reactive stream for DOM updates
  add("GET", "/api/events", (context) => {
    return streaming.handleStream(context);
  });
}
