# Scheme

[![bun](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fyuriusuonly%2Fscheme%2Fmain%2Fpackage.json&query=%24.engines.bun&label=bun)](https://github.com/yuriusuonly/scheme/blob/main/package.json)
[![opencode-ai](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fyuriusuonly%2Fscheme%2Fmain%2Fpackage.json&query=%24.devDependencies.opencode-ai&label=opencode-ai)](https://github.com/yuriusuonly/scheme/blob/main/package.json)

## Overview

Scheme is a full-stack SQL training ground built with
Bun + SQLite. It server-renders the app shell from route-scoped custom
component directories (`server/external/dashboard/`, `server/external/login/`)
— shared components live in `server/external/_/` — each component owning its
own `styles.js` and `scripts.js` (plus an `index.js`) and embedding its own
`<style>` and `<script type="module">` blocks — hydrates them with a core
client runtime, lets users write arbitrary SQL against the database from a
three-pane workspace — a file-browser table tree on the left, tabbed data
tables for each opened table (query results render inside a matching table
tab, or the active tab when no table matches, with no dedicated result tab)
above a full SQL editor (live syntax highlighting, a diagnostics popup and
completions that follow the caret, a runtime error strip, and Run controls
on the right), with draggable tree/editor splits whose touch-friendly handles
(pointer-captured, `touch-action: none`, `pointercancel`-clean) snap shut at
36px and feature rounded corners — and streams
every mutation back out over Server-Sent Events so all open sessions stay in
sync. Every SQL-sandbox mutation also runs first against a single always-on
snapshot database (`snapshot/snapshot.db`, seeded with `VACUUM INTO` at first
boot) so the training data always has a backing file — restoring means
stopping the server and copying that file back over the live database.

The stack is pure vanilla JavaScript with zero runtime dependencies beyond the
Bun runtime itself:

- **Bun** — HTTP server, Server-Sent Events stream, `bun:sqlite`, static file serving.
- **SQLite** — application data (`users`, `sessions`, `synchronizations`);
  everything is a first-class citizen in the training sandbox — with WAL mode
  and foreign-key handling. SQLite's built-in internal `sqlite_*` tables are
  hidden from the schema browser so the file-browser tree shows only user
  tables and views (the raw SQL sandbox still reaches them by name).
- **Server-rendered pages** — file-based routing via top-level route
  directories in `server/external/` (`dashboard/` → `/dashboard`, `login/` →
  `/login`, `register/` → `/register`, `profile/` → `/profile`; the `_`
  shared directory is skipped); each page is composed from component
  directories. The dashboard page pre-renders the authenticated user state
  and the database structure (user tables and views — SQLite's built-in
  `sqlite_*` tables are hidden) as a file-browser table tree — no table tab
  is open by default, so the tab strip starts empty ("Select a table to view
  its rows.") — before any client JS runs.
- **External surface / internal plumbing** — everything a browser touches (SSR
  pages, view components, helpers) lives in `server/external/`; the app's
  backend machinery (microservices, event bus, persistence, router,
  middleware) lives in `server/internal/`. `server/index.js` is the only
  entry point and the composition root — it wires the whole application graph.
- **Route-scoped components** — everything a page needs lives beside it: the
  dashboard route owns its training components (`topbar`, `workspace`,
  `query_editor`, `data_browser`, `statusbar`, `toasts`, `offline_overlay`), the login route owns
  its `login_page` component — the standalone `/login` page rendered as a
  centered card (not a modal) with a self-contained token post, the register
  route owns its `register_page`, the profile route owns its `profile_page` —
  and genuinely shared bits (the `container` layout, the `button` element, the
  `pageLayout`/`coreScript`/`user`/`escape` helpers) live in
  `server/external/_/`.
- **Authentication flow** — the dashboard is private: unauthenticated page
  requests to `/dashboard` are redirected server-side to `/login`, so the
  sign-in page is the sole authentication surface; first-time visitors create
  an account at `/register`. Logging in (or registering — the server signs the
  new account in immediately) sets the `scheme_token` bearer token in both
  localStorage (client sessions) and a cookie (server-rendered session
  recognition), so a redirected browser reaches `/dashboard` already signed
  in; logout clears both and returns to `/login`.
- **Microservice architecture** — the internal server is organised as
  small domain services (`authentication`, `queries`,
  `synchronization`, `streaming`, `health`) coordinated by an in-process event
  bus (`services/event_bus.js`). Services never import one another: they
  publish domain events (`data.changed`, …) and react to them through the bus
  (the synchronization service persists each mutation, the streaming service
  fans them out over SSE). The unified `router/` directory is the only layer
  that touches the router and request/response objects.
- **SQL sandbox** — the queries microservice (`services/queries.js`) executes
  arbitrary single SQL statements against the live database. There are no
  restrictions on data: every table — `users`, `sessions`,
  `synchronizations`, and SQLite's `sqlite_*` internals — is readable and
  writable from the editor; the schema browser hides the internal `sqlite_*`
  tables, but the raw sandbox reaches any table by name. SQL is passed to the
  engine exactly as written — no rewriting, no dialect shims — so statements
  SQLite does not support fail with the underlying engine error and learners
  see the cause directly. Engine statements run as-is: read-pragmas
  (`PRAGMA table_info(...)`) return rows, assignment write-pragmas
  (`PRAGMA foreign_keys = ON`) are mutations, `VACUUM`/`ATTACH`/`DETACH`/
  `REINDEX` are allowed, and only multi-statement input is rejected. Query
  results are classified by keyword — `SELECT`/`VALUES`/`WITH`/`EXPLAIN`/
  `PRAGMA` return rows, everything else reports changes.
- **Per-component local assets** — there are no external stylesheet or script
  requests and no shared stylesheet/script file. Each custom component owns its
  own directory with a local `styles.js` (CSS strings) and `scripts.js`
  (embedded script strings) and embeds its own `<style>` / `<script
  type="module">` blocks when rendered, so a component carries exactly the
  styles and behaviour it needs and can run standalone.
- **Layout component** — the base `container` component owns the app-wide
  reset, CSS variables, typography, and responsive rules. Pages wrap their
  bodies in `container()`, so the base stylesheet lives with the layout
  component instead of a central `<head>` style block.
- **Button element** — the reusable `button` component ships its own
  `.button`-family styles (including the circular `.button-icon` variant with
  an inline SVG via the `labelHtml` option, and the borderless transparent
  `.button-plain` variant) plus a generic `[data-action]` script that delegates
  clicks (`run-query`, `toggle-tree`, `logout`) onto `window.SchemeApp` —
  toolbar/editor buttons carry only `data-action` attributes.
- **Training UI chrome** — the top bar carries the left nav menu button (☰,
  borderless, collapses/expands the table tree through core state) and a single circle
  avatar with the user's initial; pressing the avatar navigates to the private
  `/profile` page (centered circle avatar + name, icon back button top-left,
  icon logout button top-right). The dashboard has no pane subheadings — the
  tree pane scrolls, collapses, and resizes via a drag handle between the tree
  and the data view — the tree toggle animates the collapse/expand
  too (the pane slides shut and back open through the same `.is-snapping` width
  transition the drag-snap uses) — and the editor pane resizes via its own drag
  handle above
  the Run controls — and a footer status bar (`statusbar/`,
  `--statusbar-h: 28px`) that scrolls horizontally when its readouts overflow,
  led by the online/offline indicator (`#synchronization-status`, first in the
  left corner) followed by the selected table's live row count
  (`#table-count`, e.g. `users · 3 total · showing 50`) and the
  last-synchronization readout (`#last-synchronization`, fed by the core
  runtime's `scheme:synchronized` events). The dashboard is
  fully responsive: the workspace keeps the same three-pane row at every
  viewport width — the tree pane, the drag handle, and the data/editor column
  always sit side by side, so the ☰ nav button collapses/expands the tree the
  same way everywhere and the drag handle can resize it at any size — a
  `resize` listener in each drag-handle script re-clamps the inline pane size
  against the current window so a resize never
  leaves a pane hidden or oversized. Both drag handles are touch-friendly
  (`touch-action: none`, pointer-captured, `pointercancel`-clean) so a finger
  drag never sticks or is hijacked into a page scroll. The last-used layout is
  persisted per browser — every drag stop writes the workspace sizes plus the
  collapsed-tree state to `scheme_layout` in localStorage (tree pane width,
  editor pane height), and the core
  runtime's `applyLayout()` restores them at boot with the same clamps, so
  reloads keep the training window exactly as the trainee left it (snap-shut
  0px sizes are not persisted).
- **Core client runtime** — `coreScript` in `server/external/_/helpers/core.js`
  exposes `window.SchemeApp` (state, schema browser, SQL-query execution,
  IndexedDB pending-write outbox, REST plumbing, rendering, authentication, SSE reloads,
  toasts). It runs after DOM parse and hydrates the server-rendered shell; a
  truly empty `<body>` shell is generated for fallback routes and the runtime
  fills it by fetching the server-rendered dashboard page (`hydrateShell`) —
  re-instantiating the injected component scripts — before binding events.
- **Server-Sent Events** — every mutation streams to every connected client
  over plain HTTP (`text/event-stream`): the SQL sandbox's `data:changed`
  reload signal carries the mutation's scope (`affectedTables`,
  `schemaChanged`, `allTables`) plus a `mutationId`, so each open session
  refreshes only the tables the statement actually touched — and closes the
  tab of a table that was dropped — through the browser's built-in
  `EventSource`. The acting client mints the id itself (it sends a `clientId`
  with the POST that the server re-uses as the mutation id), so its own echo
  is skipped for an exactly-once refresh whether the broadcast arrives before
  or after the response.
- **IndexedDB** — the browser's built-in local store is a pending-write outbox
  only: mutations that fail to reach the server (network offline, 5xx) are
  queued FIFO (`id` auto-increment) and deleted once the server confirms them.
  A dedicated offline overlay (`offline_overlay/`) blocks the training
  workspace and reports `N statement(s) waiting to sync` while the connection
  is down; the queued statements flush automatically when connectivity
  returns. No client-side dataset caching — the server remains the source of
  truth.
- **Middleware pipeline** — composable `errorBoundary → cors → body →
  logger → authenticator` stack. Each middleware is a factory-independent
  async `(context, next)` function; the authenticator is produced by a factory
  that receives the authentication service so the pipeline never imports a
  service directly.
- **Centralized configuration** — `server/internal/configuration/` is the single
  module area that reads `process.env` (Bun loads `.env` automatically at
  startup — no manual file parsing) and derives every project-rooted path via
  `import.meta.dir` + a Bun-native join helper; the composition root and the
  CORS middleware consume `configuration` instead of touching environment
  variables directly.
- **Application container** — `server/index.js` hosts the application
  container (`getApplication`), holding the assembled services after boot so
  SSR helpers (e.g. `user.js`) reach the authentication service without
  circular imports.
- **Authentication & sessions** — SHA-256 hashed passwords, random session
  tokens stored in SQLite, and an in-memory session cache for fast lookups.
- **Synchronizations** — the `synchronizations` table records every
  SQL-sandbox mutation as an audit entry: the SQL statement (in `operation`),
  the acting user, and the request provenance (source IP, user agent), with a
  `synchronized_at` marker set when a client has consumed the entry; clients
  fetch `GET /api/synchronization/pending` and acknowledge with
  `POST /api/synchronization/acknowledge`. The same payload is never
  broadcast in full over SSE — the streaming service pushes only a sanitized
  reload signal so statement text and user details stay in the audit trail.
- **Snapshot database** — the server keeps a single always-on backup database
  at `snapshot/snapshot.db` (path via `SNAPSHOT_PATH`). On first boot it is
  seeded from the live database with SQLite's `VACUUM INTO`; afterwards every
  SQL-sandbox mutation runs against the snapshot FIRST and only then against
  the live database, so a snapshot failure aborts the write before live state
  is touched. Reads (schema browsing, table data, query reads) touch only the
  live database, and application-internal writes (accounts, sessions, audit
  entries) are intentionally not mirrored. There is no snapshot UI, API, or
  metadata table — the file at `snapshot/snapshot.db` is the whole feature,
  and restoring is a manual stop-the-server operation: copy the snapshot file
  over `storage/scheme.db` (removing the WAL sidecars) and start again.

### Formatting rules

Every file in this repository follows the same formatting rules:

| Rule | Applies to | Detail |
| ---- | ---------- | ------ |
| Separator | file/directory names | Use `_` in place of ` ` or `-` (`query_editor`, `login_page`, `error_boundary.js`) |
| Indentation | all files | 2 spaces per level |
| End of line | all files | `LF`, with a trailing newline at the end of the file |
| Quotes | `*.{js,json}` | Double quotes (embedded script strings built with single quotes where strict) |
| Multiline containers | `*.{js,json}` | Always expand `()`, `[]`, `{}` containing 2 or more values across multiple lines |
| Declaration | `*.{js,json}` | `var` for embedded client scripts (avoid backticks/`${`), `const`/`let` for server modules |

Intentionally excluded: `bun.lock` and `storage/` (generated), `.env` (local).

### Naming convention

Identifiers use full, readable words and keep acronyms — no truncation:

| Good | Bad |
| ---- | --- |
| `authentication`, `authenticationToken` | `auth`, `authToken` |
| `synchronization`, `updateLastSynchronization` | `sync`, `updateLastSync` |
| `request`, `response`, `context`, `database`, `repositories` | `req`, `res`, `ctx`, `db`, `repos` |
| `button`, `buttonAddRow` | `btn` |
| `eventSource`, `EventSource` (acronym kept) | `es` |
| `API`, `SSE`, `JSON`, `SQL` | `application_programming_interface` |

Domain events use dots (`data.changed`); SSE wire events use colons
(`data:changed`) so the browser `EventSource` contract is unambiguous.

### Quick Start

```sh
bun install
bun run start   # migrations only — no sample data is ever seeded
```

Open `http://localhost:3000`, create your first account at `/register`, and
sign in. A fresh database starts completely empty; every account is created
through registration.

| Script          | Description                                |
| --------------- | ------------------------------------------ |
| `bun run start` | Start the production server                |
| `bun run dev`   | Start with `--watch` for hot reload        |

### Project Structure

```text
.
├── .env
├── .git/
├── .gitignore
├── LICENSE.txt
├── README.md
├── assets/
│   └── favicon.svg
├── bun.lock
├── node_modules/
├── opencode.json
├── package.json
├── server/
│   ├── index.js
│   ├── external/
│   │   ├── _/               (shared directory — no page route)
│   │   │   ├── components/
│   │   │   │   ├── button/
│   │   │   │   │   ├── index.js
│   │   │   │   │   ├── scripts.js
│   │   │   │   │   └── styles.js
│   │   │   │   └── container/
│   │   │   │       ├── index.js
│   │   │   │       └── styles.js
│   │   │   └── helpers/
│   │   │       ├── core.js
│   │   │       ├── escape.js
│   │   │       ├── html.js
│   │   │       └── user.js
│   │   ├── dashboard/      (/dashboard)
│   │   │   ├── index.js
│   │   │   └── components/
│   │   │       ├── data_browser/
│   │   │       │   ├── index.js
│   │   │       │   ├── scripts.js
│   │   │       │   └── styles.js
│   │   │       ├── offline_overlay/
│   │   │       │   ├── index.js
│   │   │       │   └── styles.js
│   │   │       ├── query_editor/
│   │   │       │   ├── index.js
│   │   │       │   ├── scripts.js
│   │   │       │   └── styles.js
│   │   │       ├── statusbar/
│   │   │       │   ├── index.js
│   │   │       │   ├── scripts.js
│   │   │       │   └── styles.js
│   │   │       ├── toasts/
│   │   │       │   ├── index.js
│   │   │       │   └── styles.js
│   │   │       ├── topbar/
│   │   │       │   ├── index.js
│   │   │       │   ├── scripts.js
│   │   │       │   └── styles.js
│   │   │       └── workspace/
│   │   │           ├── index.js
│   │   │           ├── scripts.js
│   │   │           └── styles.js
│   │   └── login/          (/login)
│   │       ├── index.js
│   │       └── components/
│   │           └── login_page/
│   │               ├── index.js
│   │               ├── scripts.js
│   │               └── styles.js
│   │   └── register/       (/register)
│   │       ├── index.js
│   │       └── components/
│   │           └── register_page/
│   │               ├── index.js
│   │               ├── scripts.js
│   │               └── styles.js
│   │   └── profile/        (/profile)
│   │       ├── index.js
│   │       └── components/
│   │           └── profile_page/
│   │               ├── index.js
│   │               ├── scripts.js
│   │               └── styles.js
│   └── internal/
│       ├── configuration/
│       │   ├── environment.js
│       │   └── join_path.js
│       ├── middleware/
│       │   ├── authenticator.js
│       │   ├── body_parser.js
│       │   ├── context.js
│       │   ├── cors.js
│       │   ├── error_boundary.js
│       │   ├── logger.js
│       │   └── pipeline.js
│       ├── persistence/
│       │   ├── database.js
│       │   ├── migrations.js
│       │   └── repositories.js
│       ├── router/
│       │   ├── adapters.js
│       │   ├── create_router.js
│       │   ├── engine.js
│       │   └── pages.js
│       ├── security/
│       │   ├── generate_token.js
│       │   └── hash_password.js
│       └── services/
│           ├── authentication.js
│           ├── errors.js
│           ├── event_bus.js
│           ├── health.js
│           ├── queries.js
│           ├── streaming.js
│           └── synchronization.js
├── snapshot/
└── storage/
```

The tree follows the directory-first convention: directories appear first with
an explicit trailing `/`, followed by regular files, each level sorted A-Z
regardless of letter case. The `storage/` directory holds the live SQLite
database and the `snapshot/` directory holds the single always-on backup
database (`snapshot/snapshot.db`) — both are intentionally absent from version
control.

### Required Ignored

The following entries come from the `# Required` section of `.gitignore` and are
kept out of version control. Their contents are intentionally not listed here.

| Entry | Type |
| ----- | ---- |
| `node_modules/` | Directory of installed dependencies |
| `.env` | Local environment variables file |
| `storage/` | Runtime SQLite database generated by the server |
| `snapshot/` | Runtime snapshot database file generated by the server |

### Architecture

```text
 Browser (embedded coreScript + component scripts)
   ├─ fetch /api/*               → REST CRUD + SQL queries + authentication + synchronization
   ├─ fetch /dashboard (SSR hydr)→ fills the empty fallback shell body
   ├─ EventSource /api/events    → live reloads & DOM updates from other clients
   └─ IndexedDB "scheme"         → pending-write outbox + offline overlay

 Bun.serve (server/index.js — composition root)
   ├─ fetch(request) → router.match(method, pathname)
   │   ├─ SSR pages    /dashboard, /login, /register, /profile → server/external/{dashboard,login,register,profile}
   │   │                (route-scoped components; / redirects to /dashboard;
   │   │                 guests on /dashboard redirect to /login)
   │   ├─ API          /api/*        → router/adapters + middleware pipeline
   │   ├─ SSE stream   /api/events   → long-lived HTTP response
   │   ├─ assets       /assets/*     → favicon
   │   └─ shell        fallback GET  → empty <body> + embedded coreScript
   ├─ eventBus (services/event_bus.js) → domain events between services
   │    ├─ queries        → emit data.changed after SQL mutations (DDL too)
   │    ├─ synchronization→ persist each mutation to synchronizations
   │    ├─ streaming      → fan out sanitized scoped SSE reload signals to
   │    │                   all clients (data:changed)
   └─ streaming → named SSE events to all clients

 SQLite (server/internal/persistence/)
   ├─ users                   → id, username, SHA-256 password hash, role
   ├─ sessions                → token, user_id, expires_at
   └─ synchronizations       → audit trail: operation (SQL), user_id,
                               source_ip, user_agent, synchronized_at
```

The queries service admits everything to the training UI — every table
(application tables, user tables, and SQLite's `sqlite_*` internals) is
editable from the SQL sandbox (the schema browser hides the built-in
`sqlite_*` tables so the file-browser tree lists only user tables and views),
and engine-level statements are allowed; only multi-statement input is
rejected.

Services never import one another. The queries service publishes `data.changed`
after every SQL mutation (DDL included); the synchronization and streaming
services subscribe to those events through the in-process event bus and react
independently (sync audit trail + live SSE pushes). The synchronization entry
carries the SQL statement, the acting user, and the request provenance; the
SSE push is deliberately reduced to a reload signal
(`keyword`/`changes`/`lastInsertRowid`/`durationMs`, the mutation scope —
`affectedTables`/`schemaChanged`/`allTables` — and the `mutationId`) so no
statement or user data is broadcast to other clients.

### API Reference

| Method | Endpoint                 | Description                                    |
| ------ | ------------------------ | ---------------------------------------------- |
| `GET`  | `/api/health`            | Health check with uptime                       |
| `POST` | `/api/authentication/register` | Create an account and receive a bearer token (auto-sign-in) |
| `POST` | `/api/authentication/login`  | Authenticate and receive a bearer token    |
| `POST` | `/api/authentication/logout` | Invalidate the current session token       |
| `GET`  | `/api/authentication/me` | Return the authenticated user                  |
| `GET`  | `/api/schema`            | Full database structure — every table/view, its columns, and row counts (SQLite's built-in `sqlite_*` tables are hidden) |
| `GET`  | `/api/data/:table`       | Rows for one table or view (`?limit=`, max 500) |
| `POST` | `/api/queries`           | Run a single SQL statement `{ sql, clientId }` — raw SQLite passthrough; rows for queries, changes for mutations (with the affected-table scope `affectedTables`/`schemaChanged`/`allTables` and a `mutationId` on every mutation); the optional `clientId` (≤64 chars) is re-issued as the mutation id |
| `GET`  | `/api/synchronization/pending` | List unacknowledged audit entries (`operation`, `userId`, `sourceIp`, `userAgent`, `synchronizedAt`, `createdAt`) |
| `POST` | `/api/synchronization/acknowledge` | Acknowledge synchronised mutation ids        |
| `GET`  | `/api/events`            | Server-Sent Events stream — live data pushes   |

Write endpoints receive `Authorization: Bearer <token>` when the caller is
authenticated; unauthenticated reads are permitted, while authenticated callers
record the acting user on each mutation. The SQL sandbox returns `kind:
"results"` (with `columns` and `rows`) for `SELECT`/`VALUES`/`WITH`/`EXPLAIN`
and `kind: "changes"` (with `changes` and `lastInsertRowid`) for everything
else; only multi-statement input is rejected with 400 (a statement scanner
enforces this because `bun:sqlite` silently runs only the first statement of a
string). Every mutation response also reports the affected-table scope
(`affectedTables` — best-effort table names in the statement,
`schemaChanged` — the DDL branch, and `allTables`, widened when any named
table carries triggers) plus a `mutationId` that the SSE broadcast repeats, so
clients can refresh only the tables the statement touched and recognize their
own echo; an optional `clientId` body field (≤64 chars) is re-used verbatim as
the mutation id so the acting browser can skip its own broadcast
deterministically.

### File Breakdown

| Entry | Description |
| ----- | ----------- |
| `.env` | Local environment variables — port, host, database path, session TTL |
| `.gitignore` | Ignore rules split into `# Required` project files and `# Unwanted` non-related files, including the runtime `storage/` and `snapshot/` directories |
| `LICENSE.txt` | MIT License text owned by Yuriusu |
| `README.md` | This documentation file covering the project overview, structure, and changelog |
| `assets/favicon.svg` | SVG browser favicon for the SQL training ground |
| `bun.lock` | Bun lockfile pinning `opencode-ai@1.18.30` and platform binaries |
| `node_modules/` | Installed bun dependencies including `opencode-ai`, generated by `bun install` |
| `opencode.json` | Opencode configuration defining the `00-Orchestrator` primary agent, permissions, and instructions |
| `package.json` | Package manifest with metadata, `start`/`dev` scripts (migrations only — no seeding), the bun engine requirement, and the `opencode-ai` dev dependency |
| `server/index.js` | Bun entry point / composition root — reads the centralized configuration, persistence bootstrap (migrations only — never seeds), event bus + microservice wiring, application container (`setApplication`/`getApplication`) hosting the assembled services, router registration, middleware pipeline, generated empty-shell/static serving, and the always-on snapshot database opened right after the live one (`openSnapshotDatabase`, seeded via `VACUUM INTO` on first boot); `/` redirects to `/dashboard` |
| `server/external/_/components/button/` | Reusable button element component (shared) — owns `.button`-family styles (`styles.js`, including the circular `.button-icon` variant and the borderless transparent `.button-plain` variant — with its danger-tinted `.button-plain-danger` modifier) plus a generic `[data-action]` click-delegation script (`scripts.js`) mapping actions (`run-query`, `toggle-tree`, `logout`) onto `window.SchemeApp`; the `labelHtml` option injects raw HTML markup (e.g. inline SVG icons) over the escaped label |
| `server/external/_/components/container/` | Base layout component (shared) — owns the app-wide reset, CSS variables, base typography, and responsive rules; pages wrap their bodies in `container()` |
| `server/external/_/helpers/core.js` | Core client runtime string — `coreScript` exposing `window.SchemeApp` (state, schema browser, SQL-query execution, IndexedDB pending-write outbox + offline queueing, REST plumbing, rendering, authentication, SSE reloads with scoped invalidation and own-mutation echo skipping, toasts), embedded once in `<head>` by `html.js` |
| `server/external/_/helpers/escape.js` | XSS-escaping helper (`escapeHtml`) used by every server-side component |
| `server/external/_/helpers/html.js` | Shared page layout — `pageLayout()` composing the document `<head>`, the embedded core `<script type="module">` block (`coreScript`), and the body shell |
| `server/external/_/helpers/user.js` | Auth-state helper — resolves the current user through the application container for SSR |
| `server/external/dashboard/index.js` | Dashboard page handler (`/dashboard`) — the main page; server-renders the training workspace for authenticated users (user state, full schema as a file-browser table tree, no table tab open by default — the tab strip starts empty) and redirects guests to `/login`, wrapped in `container()` |
| `server/external/dashboard/components/data_browser/` | Data/structure browser component (SSR markup + client reload wiring) — the database pane is split by the workspace into a left tree pane and a right tabbed data pane. `dataBrowserTree()` renders `<section class="pane pane-browser" id="tree-pane">` with the file-browser tree (`#schema-tree`, focusable `tabindex="-1"`) whose items list every user table/view (SQLite's built-in `sqlite_*` tables are hidden from the listing) with an expandable column listing and a row-count badge, and the tree fills the pane (`flex: 1`); `dataBrowserTable()` renders `<section class="pane pane-table" id="table-pane">` with a tab strip (`#tab-strip`) holding one tab per open table and a tab panel (`#tab-panel`) rendering the active table's rows as an HTML table. Query results always render inside a real table tab — a `SELECT` whose columns exactly match a table's column set opens/reuses that table's tab (`findQueryTable`), anything else stays in the active tab — there is no dedicated result tab; runtime SQL failures still do **not** render here (they surface in `#editor-error` above the editor toolbar). Closing the active tab activates its neighbor; the very last tab may be closed too, leaving the strip empty with a "Select a table to view its rows." prompt — while empty the strip itself is hidden (`.tab-strip:empty { display: none; }`), so the pane shows only the prompt. The rendered table's `thead` sticks flush below the tab strip while rows scroll: `#tab-panel` carries no top padding (spacing comes from the table's `margin-top`) so body cells can never appear above the header in the padding band, and the table uses `border-collapse: separate` (with `border-spacing: 0`) plus a `z-index`ed header so scrolled rows never bleed through the collapsing border layer. The schema tree is focused on item/tab clicks; the tree scrolls on demand, collapses via the topbar's left nav button (`data-action="toggle-tree"` → core `SchemeApp.toggleTreePane`, class toggled on `.workspace` — the toggle animates the pane's width shut and back open through the same `.is-snapping` transition the drag-snap uses, with the collapsed rule at `width: 0 !important` plus a zeroed border so no 1px sliver remains at width 0), and is horizontally resizable via the workspace's drag handle (`#tree-drag-handle`, rewriting `.pane-browser`'s inline width — clamped wide enough to cover the whole vertical column, but snapping the pane shut at 0px below a 36px threshold with an `.is-snapping` transition). The workspace keeps this same three-pane row at every viewport width — there is
  no separate small-screen layout: the tree pane stays in the flex row beside the
  drag handle and the data/editor column at every size (see `workspace/`), so
  the toggle and the drag handle behave identically on a phone and on a wide
  screen. The layout state is persisted too: every drag stop calls the core
  runtime's `SchemeApp.saveLayout()` (`scheme_layout` in localStorage — tree
  width, editor height, `treePaneCollapsed`) and `applyLayout()` restores it at
  boot with the same clamps, dropping snap-shut 0px values. Empty tables open as normal tabs — their column headers come from PRAGMA (`listTableData`) and the panel renders a "No rows" row. Server-side markup builders (`renderTreeMarkup`/`renderTabsMarkup`/`renderPanelMarkup`) mirror the client builders in the core runtime (`renderSchemaTree`/`renderTabs`/`renderTabPanel`). Data refetching is scoped: after a `data:changed` frame the runtime reloads only the open tabs named by the mutation's `affectedTables` scope (a tab whose table was dropped is closed outright) instead of every open table |
| `server/external/dashboard/components/offline_overlay/` | Offline blocker component — a fixed full-viewport overlay (`#offline-overlay`, z-index 1500 below the toasts) shown by the core runtime whenever the connection drops or a mutation is queued: a centered card explains the connection is lost and lists `N statement(s) waiting to sync` (`#offline-pending`), refreshed from the outbox; markup + component styles only — show/hide is driven by the core runtime's `setOnlineStatus`/`refreshOfflinePending` |
| `server/external/dashboard/components/query_editor/` | SQL editor component — renders directly inside the pane (no subheading): overlay-`<pre>` syntax highlighting (keywords, tables, `*`/comparison operators), live diagnostics (unbalanced parens, unterminated literals) shown as an absolute popup (`#editor-diagnostics`) anchored to the editor shell's top-right while the code is dirty (Escape hides it), completions (Ctrl+Space / typed prefix) anchored below the caret line (flipping above when there is no room), a light danger-tinted runtime error strip (`#editor-error`) above the `.editor-toolbar` whose Run query / Clear buttons sit right-aligned, Ctrl+Enter run, Tab indentation, scroll sync, and the completion popup hides on window resize |
| `server/external/dashboard/components/toasts/` | Toast notification container component — styles only; toasts are created by the core runtime |
| `server/external/dashboard/components/statusbar/` | Footer status bar component — `<section id="statusbar">` fixed at the dashboard bottom (`--statusbar-h`, owned by `container`) as a single horizontally scrollable row (`overflow-x: auto`, thin scrollbar, `overscroll-behavior-x: contain`) with non-shrinking children so long readouts stay reachable. It leads with the online/offline indicator (`#synchronization-status`, the first/leftmost child — green/yellow/red dot fed by core `setOnlineStatus`, moved here from the topbar), then the selected table's live row count (`#table-count`, fed by core `updateTableCount`, e.g. `users · 3 total · showing 50`; `No table selected` until one is opened), the last-synchronization readout (`#last-synchronization`, `—` until the first `scheme:synchronized` event); its script listens to the core bus and refreshes the readout, and its styles own the compact footer (separator top border, muted text, `@media (max-width: 768px)` padding) |
| `server/external/dashboard/components/topbar/` | Page header component — pre-renders the avatar initial (the online status indicator moved to the footer statusbar); script wires the avatar to `/profile` and mirrors `scheme:user` transitions onto the avatar initial; the left nav menu button (☰, bare `button-plain` — no border or background) toggles the table tree through the shared `button` `data-action="toggle-tree"` |
| `server/external/dashboard/components/workspace/` | Three-pane shell component — `workspace({ left, rightTop, rightBottom })` lays a left pane (`left`) and a `#tree-drag-handle` strip beside a `.workspace-vertical` column holding `rightTop` (the data browser), a `#editor-drag-handle`, and `rightBottom` (the SQL editor). The pane widths/heights are static by default: the tree pane is `flex: 0 0 auto` at 224px and the table/editor panes share the vertical column (`flex: 1 1 0`), with `#editor-drag-handle` the last flex child so the editor toolbar always sits above it. `workspaceScript` wires both drag handles from pointer events — the tree handle rewrites `.pane-browser`'s inline width (up to the whole column width) and the editor handle rewrites `.pane-editor`'s inline `flex: 0 0 <height>px` (up to the whole column height), each snapping its pane shut below a 36px threshold (0px with an `.is-snapping` transition, `body.tree-resizing`/`body.editor-resizing` during the drag), and both handles are pill-shaped with rounded corners (`border-radius: 3px`) and touch-safe (pointer-captured, `touch-action: none`, `pointercancel`-clean). `.workspace.tree-collapsed` hides the tree pane and its handle (toggled by the topbar ☰ button — on wide screens the toggle animates the collapse/expand: `toggleTreePane` drops `.is-snapping` on the pane so the `.workspace.tree-collapsed` `width: 0 !important` rule (with the border zeroed so no 2px sliver remains) slides the tree shut and back open); on every screen size — the same ☰ button animates the tree's width shut and back open via `.tree-collapsed` + `.is-snapping` at any viewport width, the drag handle resizes the tree at any width (clamped up to the workspace minus 42px, snapping shut below 36px), and on a `resize` event both handle scripts re-clamp their inline pane sizes against the current window so a breakpoint change never leaves a pane hidden or oversized — and the dragged sizes persist too: both `stopDrag` handlers and `toggleTreePane` call `SchemeApp.saveLayout()` after a drag, writing the tree width, editor height, and `treePaneCollapsed` to `scheme_layout` in localStorage, and the core runtime's `applyLayout()` restores them at boot under the same clamps (dropping snap-shut 0px values) |
| `server/external/login/index.js` | Login page handler (`/login`) — standalone sign-in card (the login_page component) wrapped in `container()` without the core runtime; already-authenticated visitors are redirected to `/dashboard` |
| `server/external/login/components/login_page/` | Standalone sign-in page component — a centered login card (a full page, not a modal) with a self-contained script that posts to `/api/authentication/login`, stores the `scheme_token` in both localStorage and a cookie, and redirects to `/dashboard`; links first-time visitors to `/register` |
| `server/external/register/index.js` | Register page handler (`/register`) — standalone account-creation card (the register_page component) wrapped in `container()` without the core runtime; already-authenticated visitors are redirected to `/dashboard` |
| `server/external/register/components/register_page/` | Standalone account-creation page component — a centered card (matching the login page) with username/password/confirm fields and a self-contained script that posts to `/api/authentication/register`, stores the `scheme_token` in both localStorage and a cookie, and redirects to `/dashboard` |
| `server/external/profile/index.js` | Profile page handler (`/profile`) — private to authenticated users like the dashboard; guests are redirected to `/login`. Renders the profile_page component wrapped in `container()` without the core runtime (`modules: false`) |
| `server/external/profile/components/profile_page/` | Standalone user profile page component — a top bar with a borderless icon back button (arrow-left SVG, `button button-plain button-icon`, → `/dashboard`) on the left and a borderless icon logout button (door/arrow SVG, `button button-plain button-plain-danger button-icon`, no text label) on the right — both carry no border and a transparent background, tinting only the glyph on hover — plus a centered card showing a large circle avatar with the user's initial and the full username; the self-contained script posts to `/api/authentication/logout` with the bearer token, clears `scheme_token` from localStorage and the cookie, and redirects to `/login` |
| `server/internal/configuration/` | Centralized configuration — `environment.js` (reads `process.env`, Bun auto-loads `.env` with no manual parsing, derives every project-rooted path from `import.meta.dir`) and `join_path.js` (Bun-native `joinPath` helper, no `node:path`); consumed by the composition root and the CORS middleware |
| `server/internal/middleware/` | Composable middleware pipeline — `context.js` (request context), `pipeline.js` (runner), `cors.js`, `body_parser.js`, `logger.js`, `error_boundary.js` (JSON error boundary), `authenticator.js` (factory bound to the authentication service) |
| `server/internal/persistence/` | SQLite layer — `database.js` (open + migrations, `openSnapshotDatabase` seeding the always-on backup via `VACUUM INTO` at first boot, Bun-native directory creation via `Bun.write`; no seeding), `migrations.js` (schema migrations incl. legacy renames `sync_log`/`_synchronization_log`/`synchronization_log` → `synchronizations`, `_users` → `users`, `_sessions` → `sessions`, the retired `records` grid removal, the dropped `snapshots` metadata registry, and the `synchronizations` audit schema — created fresh or upgraded in place by folding `statement` into `operation`, dropping the old execution-fact columns, renaming `synced_at` → `synchronized_at`, and rebuilding the table into the canonical column order `id`/`created_at`/`synchronized_at`/`operation`/`user_id`/`source_ip`/`user_agent` when an older physical order differs), `repositories.js` (prepared-statement CRUD repositories against the application tables) |
| `server/internal/router/` | The complete routing layer — `engine.js` (pattern-matching engine — REST `:param` routes + exact page pathnames, dispatched from `match(method, pathname)`), `adapters.js` (every `/api/*` endpoint as a thin HTTP adapter into the microservices), `pages.js` (file-based `server/external/` page discovery, top-level dirs except `_`, via Bun's native glob scanner + plain absolute-path `import()`), and `create_router.js` (assembles engine + adapters + pages via `createRouter({ services, pagesDirectory })`) |
| `server/internal/security/generate_token.js` | Token generation helper — cryptographically random hex `generateToken` from the Web Crypto API |
| `server/internal/security/hash_password.js` | Password hashing helper — SHA-256 `hashPassword` from the Web Crypto API |
| `server/internal/services/authentication.js` | Authentication microservice — registration, login, logout, session identity, in-memory session cache |
| `server/internal/services/errors.js` | HTTP error helpers — `HttpError`, `badRequest`, `unauthorized`, `notFound` |
| `server/internal/services/event_bus.js` | In-process event bus — pub/sub (`on`/`emit`) with exact or trailing `.*` wildcard patterns |
| `server/internal/services/health.js` | Health microservice — uptime reporting |
| `server/internal/services/queries.js` | SQL sandbox microservice — enrollment of the full schema with per-table row counts (SQLite's built-in `sqlite_*` tables are hidden from the listing; the raw sandbox still reaches them by name), table data, and single-statement raw SQLite execution (no rewriting), read/write PRAGMA handling, multi-statement rejection, classification by first keyword, per-statement mutation-scope derivation (`affectedTables`/`schemaChanged`/`allTables`, widened when a named table carries triggers), mutation ids (a client-supplied `clientId` re-used verbatim, server sequence fallback), and `data.changed` publishing enriched with the SQL text, execution facts, request provenance, scope, and mutation id |
| `server/internal/services/streaming.js` | Streaming microservice — SSE transport, named wire events, sanitized scoped reload-signal broadcast (the mutation's `affectedTables`/`schemaChanged`/`allTables` plus the `mutationId`), keep-alive heartbeat |
| `server/internal/services/synchronization.js` | Synchronization microservice — sync log + event auditing (SQL statement, acting user, source IP, user agent), pending/acknowledge via `synchronized_at` |
| `snapshot/` | The single always-on backup database — `snapshot/snapshot.db`, seeded with `VACUUM INTO` on first boot and mirroring every SQL-sandbox mutation (Git ignored) |
| `storage/` | Runtime SQLite database generated by the server (Git ignored) |

## Changelog

<table>
  <thead>
    <tr>
      <th>TIMELINE</th>
      <th>DETAILS</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>2026-09-21 11:20:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Audit table renamed</code>: The <code>synchronization_log</code> SQLite table is now <code>synchronizations</code>. Migrations (<code>migrations.js</code>) gain the <code>synchronization_log</code> → <code>synchronizations</code> rename — the legacy <code>sync_log</code>/<code>_synchronization_log</code> predecessors rename straight to the final table too — and the fresh-create/upgrade/rebuild SQL plus the <code>idx_synchronizations_user</code>/<code>idx_synchronizations_synced</code> indexes target the new name; the repository prepared statements follow. The <code>/api/synchronization/*</code> API surface, the component identifiers, and the SSE wire events are unchanged (the <code>synchronization</code> naming convention already matched the API). The runtime <code>storage/</code> and <code>snapshot/</code> directories were also deleted so the next boot starts from a completely empty database and a fresh snapshot — the rename then lands as a fresh create.</li>
          <li><code>README.md</code>: Updated the current-state references — the <code>SQLite</code> and <code>SQL sandbox</code> overview bullets, the <code>Synchronizations</code> bullet, the formatting-rule separator example (<code>synchronization_log</code> → <code>query_editor</code>), the architecture diagram, and the persistence file-breakdown row — and recorded this rename in the changelog (historical entries keep their <code>sync_log</code>/<code>_synchronization_log</code>/<code>synchronization_log</code> wording).</li>
          <li><code>Verification</code>: Fresh boot against the cleared directories recreated <code>storage/scheme.db</code> and <code>snapshot/snapshot.db</code>; <code>GET /api/schema</code> lists <code>sessions</code>/<code>synchronizations</code>/<code>users</code> in canonical column order (no <code>synchronization_log</code>, no <code>sqlite_*</code>); <code>CREATE TABLE</code> + <code>INSERT</code> over <code>POST /api/queries</code> appended two audit entries to <code>synchronizations</code> (the SQL in <code>operation</code>, <code>userId</code>, <code>sourceIp</code>, <code>userAgent</code>, <code>clientId</code>-echoed <code>mutationId</code>), <code>GET /api/synchronization/pending</code> listed them with <code>synchronizedAt: null</code> and <code>POST /api/synchronization/acknowledge</code> answered <code>acknowledged: 2</code>; the snapshot database carried the same tables and the insert row. All 8 embedded client-script blocks compile (<code>bun build --target=browser</code>). The probe data was cleaned up and the project <code>storage/</code>/<code>snapshot/</code> directories were removed again so the workspace is left cleared.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-21 11:45:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>IndexedDB pending-write outbox</code>: The browser's local store (<code>scheme</code>, <code>IDB_VERSION = 3</code>) is now a pending-write outbox only — all dataset caching was removed from the core runtime (<code>server/external/_/helpers/core.js</code>). The old <code>cache</code> store (keyPath <code>key</code>) is deleted by the version upgrade and replaced with <code>outbox</code> (keyPath <code>id</code>, <code>autoIncrement</code>, FIFO); <code>idbPut</code>/<code>idbDelete</code>/<code>idbGetAllPending</code> manage FIFO entries <code>{ id, sql, createdAt }</code>. <code>loadSchema</code>/<code>loadTable</code> read the server exclusively — the fallback-cache branches are gone, so a network failure toasts <code>Failed to load …</code> without pretending success. The server remains the source of truth.</li>
          <li><code>Offline overlay component</code>: New <code>server/external/dashboard/components/offline_overlay/</code> (markup + styles only) — a fixed full-viewport overlay (<code>#offline-overlay</code>, z-index 1500 below the toasts) with a centered card listing N statement(s) waiting to sync (<code>#offline-pending</code>), composed into the dashboard after <code>toasts()</code>. The core runtime's <code>setOnlineStatus()</code> shows it on any non-online transition and feeds the pending count via <code>refreshOfflinePending()</code> (outbox <code>getAll</code> count), so an offline boot blocks the training workspace immediately; <code>handleConnected()</code> (SSE <code>onopen</code>) probes <code>/api/health</code>, retries the schema load, flushes the outbox, and hides the overlay only when connectivity is restored.</li>
          <li><code>Queueing rules</code>: <code>runQuery</code> gained an offline guard (toast <code>You are offline — reconnecting</code> and return while <code>state.offline</code>) and a catch that queues only network failures (<code>!error.status || error.status &gt;= 500</code>) of mutation-kind statements (<code>isMutationStatement</code> — first keyword not <code>SELECT</code>/<code>VALUES</code>/<code>WITH</code>/<code>EXPLAIN</code>): enqueue + <code>setOnlineStatus("offline")</code>, never the error text. 401 responses redirect to <code>/login</code> and 4xx engine errors render <code>#editor-error</code> — neither is queued. <code>flushPendingWrites()</code> drains FIFO on reconnect: each entry mints a <code>clientId</code> (re-used by the server as the mutation id so the acting session skips its own SSE echo), posts, deletes the entry on success, stops on a network failure, drops poisoned 4xx entries (toast + continue), and redirects on 401.</li>
          <li><code>Fixes along the way</code>: The CDP E2E exposed two real flaws — a stale-Chrome/port collision (the login step rendered as a blank overlay from a leftover <code>remote-debugging-port</code> instance), fixed by launching Chrome on a unique port (<code>9840 + Math.floor(Math.random() * 150)</code>) with <code>pkill</code> cleanup before/after; and a template-literal backslash-eating bug in the <code>coreScript</code> (the regex <code>/\s|\(/</code> in <code>isMutationStatement</code> was written with single backslashes, so the emitted client code contained <code>/s|(/</code> and threw <code>SyntaxError: Invalid regular expression: /s|(/: Unterminated group</code> at runtime) — the source now doubles every backslash (<code>split(/\\s|\\(/)</code>) and a grep sweep confirmed no other raw backslashes in the new region.</li>
          <li><code>Verification</code>: <code>bun build --target=browser</code> on <code>core.js</code> is clean (~50.36 KB); the embedded-script compile check passes. The headless-Chrome CDP E2E (<code>offline_e2e_cdp.mjs</code>) is fully green — 14 assertions: registration + login render, the dashboard shell hydrates, the <code>users</code> tab opens, the outbox store exists and the legacy <code>cache</code> store is gone after the version upgrade, a mutation run while <code>/api/queries</code> is intercepted (Fetch <code>InternetDisconnected</code>, EventSource left open) shows the overlay with exactly one pending statement and lands no row, further runs are blocked while offline, and after <code>Network.emulateNetworkConditions</code> returns online the overlay hides, the pending line clears, and the queued row lands in SQLite (polled up to 8 s) with the <code>users</code> tab intact. The harness probe itself was fixed to insert into the real <code>password</code> column (not <code>password_hash</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-21 10:35:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Built-in SQLite tables hidden from the schema browser</code>: The file-browser tree no longer lists SQLite's internal <code>sqlite_*</code> tables (<code>sqlite_schema</code>/<code>sqlite_master</code>, <code>sqlite_sequence</code>, <code>sqlite_stat*</code>, ...) — the queries service filters them out of the schema enrollment before any row counts or column lookups run (<code>isBuiltinSqliteName</code> + <code>.filter()</code> in <code>listSchema()</code>). Because the tree markup (SSR + client), the editor completions, and the query-tab matcher all derive from that listing, hiding at the source keeps the whole UI focused on user tables and views. The raw SQL sandbox is untouched: the unrestricted <code>execute()</code> path still reaches the built-in tables by name (e.g. <code>SELECT name FROM sqlite_schema</code>), and <code>listTableData()</code> still serves any built-in name SQLite stores as a real schema row (<code>sqlite_sequence</code>), exactly as before (SQLite itself forbids writing to them directly).</li>
          <li><code>README.md</code>: Updated the <code>SQLite</code> and <code>SQL sandbox</code> overview bullets, the architecture notes (browser hides <code>sqlite_*</code>, sandbox still reaches them), the API reference (<code>/api/schema</code> row), and the file-breakdown rows (queries service, data browser); recorded this change in the changelog.</li>
          <li><code>Verification</code>: The edited <code>queries.js</code> module loads clean; a live-server pass against a fresh database confirms <code>GET /api/schema</code> lists no <code>sqlite_*</code> names (the built-in <code>sqlite_sequence</code> row is hidden along with the schema table) while a user-created table appears with its row count, and the raw sandbox still reaches built-ins — <code>SELECT name FROM sqlite_schema</code> over <code>POST /api/queries</code> returns the engine rows and <code>GET /api/data/sqlite_sequence</code> still serves the stored internal row.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-21 10:21:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Scoped SSE invalidation</code>: Connected clients no longer re-read the whole schema plus every open table on every mutation — the sandbox now tells each session exactly what changed. The queries microservice derives a per-statement mutation scope (<code>affectedTables</code> — best-effort table names in the statement, <code>schemaChanged</code> — the DDL branch, and <code>allTables</code>, which is widened whenever a named table carries triggers because a trigger can ripple into any other table) and returns it in the <code>POST /api/queries</code> response and the <code>data.changed</code> domain payload alike; the streaming microservice pushes the same sanitized scope in its <code>data:changed</code> wire frame. The core runtime's <code>refreshAfterMutation()</code> refetches only the open tabs whose tables the statement actually touched (a tab whose table was dropped is closed outright, and unrelated tabs keep their rows), while the schema read keeps the tree badges accurate.</li>
          <li><code>Own-mutation echo matched deterministically</code>: The acting client used to rely on response-time id assignment to skip its own broadcast, but the SSE echo is emitted server-side <em>before</em> the HTTP response flushes — on loopback the echo always won the race and produced an extra <code>Database changed — reloaded</code> toast plus a second refresh. Each <code>runQuery()</code> now mints a <code>clientId</code> before dispatching and sends it in the POST body; the server re-uses it verbatim as the mutation id (64-char cap, <code>mutation-</code> sequence fallback for API callers that do not send one). Because the browser knows the id at dispatch time, the identical-id echo is recognized and skipped whether it arrives before or after the response — the acting session refreshes exactly once from the authoritative response scope, and all remote sessions still refresh from the echo.</li>
          <li><code>Verification</code>: All 8 embedded client-script blocks compile (<code>bun build --target=browser</code> against the authenticated SSR page); an HTTP + SSE matrix confirms the scope fields land in both the response and the broadcast and a legacy caller without <code>clientId</code> still gets a server-generated id. The headless-Chrome CDP E2E is fully green (13 assertions) — an unrelated <code>CREATE TABLE</code>/<code>INSERT</code> does not refetch the open <code>users</code> tab, an <code>INSERT</code> into the <code>scratch</code> table refetches exactly that tab and shows the new row, the own-mutation refresh fires exactly once with no echo toast, and <code>DROP TABLE</code> closes the dead <code>scratch</code> tab while leaving <code>users</code> intact.</li>
          <li><code>README.md</code>: Updated the <code>Server-Sent Events</code> overview bullet, the architecture diagram and notes (scoped reload signals), the API reference (<code>POST /api/queries</code> scope fields + optional <code>clientId</code>), and the file-breakdown rows (queries service, streaming service, core runtime, data browser); recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-20 08:17:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Single always-on snapshot database</code>: The snapshot feature is now one backup file — <code>snapshot/snapshot.db</code> (configurable via <code>SNAPSHOT_PATH</code>). On first boot it is seeded from the live database with SQLite's <code>VACUUM INTO</code> (<code>openSnapshotDatabase()</code> in <code>persistence/database.js</code>, called from the composition root right after the live database opens); every later boot just re-initializes it (WAL + foreign keys + idempotent migrations). It has no UI, no API, and no metadata table — the retired <code>snapshots</code> registry is dropped wherever a legacy database still has it.</li>
          <li><code>Snapshot-first writes</code>: The queries microservice (<code>services/queries.js</code>) mirrors every SQL-sandbox mutation onto the snapshot FIRST and only then onto the live database — the identical statement runs on the snapshot and a failure aborts the write before live state is touched. Reads (schema, table data, query reads) touch only the live database, and application-internal writes (accounts, sessions, audit entries) are intentionally not mirrored. Restoring is a manual stop-the-server operation: copy <code>snapshot/snapshot.db</code> over <code>storage/scheme.db</code> (removing the WAL sidecars) and start again.</li>
          <li><code>Surface removed</code>: The dashboard snapshot flyout (<code>snapshot_manager/</code> component), the topbar database toggle (<code>data-action="toggle-snapshots"</code>), the <code>#server-timezone</code> statusbar readout, the five <code>/api/snapshots*</code> adapters, and the <code>snapshots.js</code> microservice were deleted; the topbar right side is the avatar alone again.</li>
          <li><code>README / .gitignore</code>: Overview bullets (SQLite app-data list, dashboard components, microservice list, Training UI chrome, new <code>Snapshot database</code> bullet), the project-structure tree (<code>snapshot_manager/</code> and <code>snapshots.js</code> gone), the Required-Ignored table, the architecture diagram (no restore coordinator, no registry table), the API reference (snapshot rows gone), the file-breakdown rows, and this changelog entry; <code>snapshot/</code> stays ignored.</li>
          <li><code>Verification</code>: All 10 embedded client-script blocks compile. A live-server pass — <code>snapshot/snapshot.db</code> created at boot and seeded from a fresh database; guest <code>/dashboard</code> <code>302</code> to <code>/login</code>; all <code>/api/snapshots*</code> routes <code>404</code>; sandbox <code>CREATE TABLE</code> + <code>INSERT</code> land in the live and snapshot databases alike; a legacy <code>snapshots</code> registry stays dropped; the authenticated dashboard SSR ships no <code>toggle-snapshots</code>/<code>server-timezone</code>/<code>snapshot_manager</code>/<code>data-snapshot-action</code> markup — and probe data was cleaned up (users holds only <code>administrator</code>, <code>mirror_check</code> gone from both databases).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 16:45:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Backtick-escaping fix in coreScript</code>: The embedded core runtime (<code>server/external/_/helpers/core.js</code> — the <code>coreScript</code> template literal, line 23&hellip;1163) compiled <code>0 fail / 10 blocks</code> under <code>bun build --target=browser</code>. Fixing the doc-comment backticks added with the acknowledge block: the previous change wrote <em>raw</em> backticks inside the template body (e.g. <code>&#96;GET /api/synchronization/pending&#96;</code>, <code>&#96;synchronized_at&#96;</code>), and bun toggles template-literal state on every raw backtick, so the standalone extraction of the ack block (lines 836&ndash;857) balanced on its own but the <em>full</em> <code>coreScript</code> body desynced — the first raw backtick at 833:52 toggled <em>out</em> of the template, the second at 833:68 toggled back <em>in</em>, and the text between (<code>synchronized_at</code> and the &ldquo;1. / 2.&rdquo; restart terms, 841&ndash;854) parsed as code, producing <code>Expected &quot;;&quot; but found &quot;synchronized_at&quot;</code> at 833:53 and <code>Invalid flag &quot;o&quot;</code> at 846:33. A byte-level toggler confirmed 26 raw toggles in the file (16 inside the template region — lines 5, 7, 18&ndash;19 are the pre-template doc comment and are correct). All 16 interior raw backticks are now escaped as <code>\&#96;</code>, so the template body is inert template text again; the full <code>core.js</code> standalone build passes (40.80 KB, 0 errors), the 10-block embedded-script suite compiles, and the server boots (guest <code>/dashboard</code> &rarr; 302 <code>/login</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 16:10:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Unified three-pane row</code>: The small-screen push drawer is gone — the workspace keeps the same three-pane flex row at every viewport width, so the tree pane, the drag handle, and the data/editor column sit side by side on phones and desktops alike. <code>workspace/styles.js</code> deleted the entire <code>@media (max-width: 959px)</code> block (the absolutely pinned drawer pane, the <code>--browser-pane-width</code>/<code>--browser-pane-gap</code>/<code>--browser-pane-handle</code> variables, and the drawer/grip/column slide transforms); <code>.workspace</code> is the same <code>gap: 6px</code> row at every size, and <code>.workspace.tree-collapsed</code> keeps the <code>width: 0 !important</code> + zeroed-border rule so the ☰ toggle animates the tree's width shut and back open through the same <code>.pane-browser.is-snapping</code> transition at any viewport. <code>data_browser/scripts.js</code> dropped <code>isSmallScreen()</code>/<code>drawerMaxWidth()</code> and the drawer drag branch — the tree handle now always rewrites <code>.pane-browser</code>'s inline width (clamped up to <code>workspaceWidth − 42</code>, snapping shut below 36px) at every size — and <code>_/helpers/core.js</code> removed the drawer state (<code>browserOpen</code>, <code>--browser-pane-width</code>), <code>applyResponsiveLayout()</code>, and the drawer-open persistence; <code>toggleTreePane()</code> always toggles <code>treePaneCollapsed</code> and clears only a 0px inline width when expanding. The <code>workspace/index.js</code> docblock was rewritten to the uniform-row layout.</li>
          <li><code>README.md</code>: Updated the <code>Training UI chrome</code> overview bullet (fully responsive paragraph + layout-persistence line) and the <code>data_browser/</code> and <code>workspace/</code> file-breakdown rows for the unified row layout, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile; the dashboard CDP E2E grew to 39 assertions — at 700px the tree keeps the row at its dragged width, the handle stays a flex child between the tree and the column, the ☰ toggle collapses/expands the tree exactly like wide (0px / back to its width), a drag resizes the inline width and persists it, dragging below 36px snaps the tree shut (≤2px — headless rendering stalls the 180ms ease tail) and two toggles clear the zero state back to the 224px default, and at 390px the row layout still holds with the column visible; probe user cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 12:52:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Layout persistence</code>: The dashboard now remembers the resizable layout per browser — every drag stop and the tree toggle persist the workspace geometry to <code>scheme_layout</code> in localStorage (<code>LAYOUT_KEY</code>, <code>LAYOUT_MIN_PANE_SIZE = 36</code> in the core runtime): wide-screen tree width, editor pane height, small-screen drawer width, and <code>treePaneCollapsed</code>. The core runtime (<code>server/external/_/helpers/core.js</code>) gained <code>readLayoutState()</code>/<code>writeLayoutState()</code>/<code>saveLayout()</code>/<code>applyLayout()</code>: both drag scripts' <code>stopDrag</code> call <code>SchemeApp.saveLayout()</code> (workspace + data_browser), <code>toggleTreePane()</code> persists the collapse state on expansion/collapse, and <code>applyLayout()</code> runs in <code>init()</code> after <code>tryAutoLogin</code> (before <code>loadSchema</code>) to restore the stored sizes under the same clamps as the resize handlers (maxes off the current workspace, 36px floor), then reconciles via <code>applyTreePaneCollapsed()</code>/<code>applyResponsiveLayout()</code>. Expanding the collapsed tree no longer resets a dragged/custom width — <code>toggleTreePane</code> only clears the inline width when it is missing or 0, so a persisted width survives the whole toggle cycle. Snap-shut 0px sizes and the drawer-open (<code>browserOpen</code>) state are deliberately not persisted.</li>
          <li><code>README.md</code>: Updated the <code>Training UI chrome</code> overview bullet and the <code>data_browser/</code> and <code>workspace/</code> file-breakdown rows for the persisted layout, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile (<code>bun build --target=browser</code>); the dashboard CDP E2E grew to 48 assertions — a 320px tree drag writes <code>scheme_layout.treePaneWidth: 320</code>, a reload restores the 320px tree (<code>applyLayout</code> runs async after <code>tryAutoLogin</code>), a ☰ collapse persists <code>treePaneCollapsed: true</code>, a reload restores the collapsed tree at exactly 0px, expanding restores the stored 320px width instead of the default 224px, an editor drag to 260px persists <code>editorPaneHeight: 260</code> and a reload restores the 260px editor pane, and the original wide-toggle/drawer/grip/lockstep checks still pass; probe user cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 01:45:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Small-screen push drawer</code>: The tree pane no longer swaps in full-size below 959px — it now pushes the data/editor column aside. The small-screen media query owns the whole effect: <code>.workspace</code> becomes <code>position: relative</code> with a <code>--browser-pane-width: min(80vw, 320px)</code> and a <code>--browser-pane-gap: 6px</code> (matching the base workspace gap), <code>.pane-browser</code> is absolutely pinned to the left edge (<code>top</code>/<code>bottom</code>/<code>left: 8px</code>, <code>width: var(--browser-pane-width)</code>) and translated fully off-screen by default (<code>translateX(calc(-100% - 8px))</code>), and the topbar ☰ button (core <code>browserOpen</code> state, <code>.workspace.browser-open</code>) slides it in while <code>.workspace-vertical</code> translates sideways by <code>calc(var(--browser-pane-width) + var(--browser-pane-gap))</code> — the two transforms share the width variable so they move in lockstep and never overlap, and part of the column stays visible off the edge with the usual gap between panes. Both transitions are <code>transform 240ms ease</code> (the pane is no longer <code>display: none</code>, so it can animate), and selecting a table from the tree still closes the drawer (<code>closeBrowserPane</code>). No backdrop.</li>
          <li><code>Drawer grip bar</code>: The tree drag handle no longer disappears on small screens — it is now absolutely positioned in its own 6px gap one drawer width from the left edge, with another 6px gap after it (the layout's normal gap-handle-gap band, like the editor handle bar: <code>left: calc(8px + var(--browser-pane-width) + var(--browser-pane-gap))</code>, <code>top</code>/<code>bottom: 8px</code>, <code>width: var(--browser-pane-handle)</code> = 6px, <code>margin: 0</code>) and slides off-screen/back in with the drawer (<code>transform: translateX(calc(-100% - var(--browser-pane-gap) - 9px - var(--browser-pane-width)))</code> → <code>translateX(0)</code> under <code>.workspace.browser-open</code>, sharing the drawer's <code>transform 240ms ease</code>), so the open drawer keeps its vertical grip bar. A transparent <code>::before</code> (<code>left</code>/<code>right: -4px</code>) widens the touch target to 14px without touching the 6px gaps on either side. Dragging it on small screens resizes the drawer: <code>data_browser/scripts.js</code> gained <code>isSmallScreen()</code>/<code>drawerMaxWidth()</code> (<code>SMALL_SCREEN_QUERY</code>, <code>DRAWER_MIN_WIDTH = 160</code>, <code>DRAWER_PADDING = 8</code>) and the drag now branches — on small screens it writes the workspace's <code>--browser-pane-width</code> variable (clamped 160px…content width) so the pane, the grip and the pushed column stay in lockstep and the drawer cannot be snapped shut; on wide screens the inline <code>.pane-browser</code> width with the 36px snap is unchanged. <code>body.tree-resizing</code> now also kills the pane/grip/column slide transitions (<code>transition: none</code>) so a live drag tracks the pointer instead of lagging 240ms behind it, and the resize handler drops the drag-applied variable when the layout crosses back to wide (a small-screen drag is clamped against the current workspace instead).</li>
          <li><code>Bare menu button</code>: The topbar's tree-toggle menu button (☰) dropped its border — it switched from <code>button button-sm button-ghost</code> (bordered, hover-filled) to the shared bare <code>button button-sm button-plain</code> variant, so it renders with a transparent border/background and only tints its glyph on hover (the same variant the profile page's back/logout icon buttons use).</li>
          <li><code>README.md</code>: Updated the <code>Training UI chrome</code> overview bullet and the <code>data_browser/</code>, <code>workspace/</code>, and <code>topbar/</code> file-breakdown rows for the push drawer, the drawer grip bar, and the bare menu button, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile; the dashboard E2E grew to 37 assertions (now starting at a wide 1280×1000 override) — at 700×900 the tree pane is mounted but fully off-screen by default, the toggle slides it in (<code>browser-open</code>) with the column still displayed, the drawer measures 320px (<code>min(80vw, 320px)</code>), the column shifts by the drawer width plus the 18px gap-handle-gap band (6px gap, 6px handle, 6px gap) with no overlap and stays partially visible, the grip bar rides 6px clear of the drawer with another 6px gap before the column (6px wide, <code>::before</code> hit area at <code>-4px</code>), the transition is a <code>transform</code> one, the open drawer causes no horizontal page overflow, a three-phase pointer drag on the grip tracks instantly mid-drag (<code>transition-duration: 0s</code>, pane at 240px, column 18px behind the pane) and settles in lockstep after pointer-up with <code>--browser-pane-width: 240px</code>, further drags clamp to 160px and to the full content width with no page overflow, closing slides the tree and the grip back off-screen and the column home, resizing back to wide closes the drawer, restores the 224px tree + 6px handle and drops the dragged width, a 390×844 phone pass gives a 312px (80vw) drawer with the column still reachable, and the menu button's computed border/background are both <code>rgba(0, 0, 0, 0)</code>; probe user cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 02:15:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Wide-screen toggle animation</code>: The ☰ tree toggle now animates on every screen size — the wide-screen collapse/expand no longer snaps via instant <code>display: none</code>. <code>toggleTreePane</code> (<code>_/helpers/core.js</code>) adds the drag-snap's <code>.pane-browser.is-snapping</code> width transition (<code>width 180ms ease</code> — dropped via a 200ms timeout once it settles) so the tree slides shut and back open while the vertical column glides to the full pane width, matching the small-screen drawer's <code>transform 240ms ease</code> slide. The collapsed rule changed from hiding the pane and handle together to <code>.workspace.tree-collapsed .pane-browser { width: 0 !important; border-width: 0; }</code> (the <code>!important</code> deliberately beats a drag-applied inline width so the collapsed state is authoritative; the border has to be zeroed because a border-box element cannot shrink below its 1px borders, which would otherwise leave a 2px sliver at width 0) plus <code>.tree-drag-handle { display: none; }</code>. Expanding still clears a drag-snapped inline width so the default 224px returns, and the expand/restore contract is unchanged; the small-screen push drawer is untouched.</li>
          <li><code>README.md</code>: Updated the <code>Training UI chrome</code> overview bullet and the <code>data_browser/</code> and <code>workspace/</code> file-breakdown rows for the animated wide toggle, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile; headless-Chrome CDP E2E (41 assertions, starting wide at 1280×1000) — the wide tree starts expanded at 224px, clicking ☰ applies <code>tree-collapsed</code> + <code>is-snapping</code> with the pane mid-transition (width between 40 and 200, <code>transitionProperty</code> includes width, still <code>display: flex</code> not none), settles at exactly 0px with <code>border-width: 0</code> and the handle <code>display: none</code>, and the second click animates it back open to ~224px with the collapsed class gone; the drawer/grip/lockstep/setup checks still pass and the probe user was cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 01:15:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Borderless profile icon buttons</code>: The <code>/profile</code> back and logout buttons are now bare icon buttons — no border and no background. Both switched from the bordered <code>button-ghost</code> / solid <code>button-danger</code> styles to a new reusable <code>.button-plain</code> variant in the shared <code>button</code> component (transparent background, transparent border, muted glyph; hover tints only the glyph, never the frame). The logout keeps its destructive cue through the new <code>.button-plain-danger</code> modifier, which recolors just the glyph to <code>var(--c-danger)</code> / <code>var(--c-danger-hover)</code>. Back is now <code>button button-plain button-icon</code> (arrow-left) and logout <code>button button-plain button-plain-danger button-icon</code> (door/arrow); the circular 32×32 <code>.button-icon</code> geometry and the focus-visible ring are unchanged.</li>
          <li><code>README.md</code>: Updated the <code>Button element</code> overview bullet and the <code>button/</code> and <code>profile_page/</code> file-breakdown rows for the plain/plain-danger variants, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile; a headless-Chrome CDP check (<code>/tmp/profile_buttons.mjs</code>, 13 assertions) on the authenticated <code>/profile</code> SSR page confirms both buttons resolve to <code>background-color: rgba(0, 0, 0, 0)</code> and <code>border-color: rgba(0, 0, 0, 0)</code> at <code>border-radius: 50%</code> / 32×32, with the back glyph muted (<code>rgb(102, 112, 133)</code>) and the logout glyph danger-tinted (<code>rgb(220, 38, 38)</code>); the 19-assertion dashboard E2E still passes and the probe user was cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 01:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Sticky table header bleed fixed</code>: Scrolled <code>tbody</code> rows no longer show above or through the data table's sticky <code>thead</code>. The root cause was <code>#tab-panel</code>'s <code>padding: 10px 12px</code> — a scroll container clips at its padding box while a sticky header clamps to the content box, so the top 10px band scrolled rows into view above the header (measured: <code>panelTop 92</code> vs <code>headerTop 102</code>). The panel now uses <code>padding: 0 12px 10px</code> and the table carries a <code>margin-top: 10px</code> for the initial spacing; the table also switched from <code>border-collapse: collapse</code> to <code>separate</code> with <code>border-spacing: 0</code> and the <code>th</code> gained <code>z-index: 1</code>, so the shared collapsing border layer and the header stacking order can never let body cells paint over the header.</li>
          <li><code>README.md</code>: Updated the <code>data_browser/</code> file-breakdown row with the sticky-header rules and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile; a headless-Chrome CDP pixel test (<code>/tmp/thead_verify.mjs</code>) painted <code>tbody</code> cells cyan and scrolled the panel to 260px — the header clamped flush at the panel top (92 == 92, <code>border-collapse: separate</code>, <code>z-index 1</code>) with <strong>zero</strong> body-colored pixels inside the header band (156,988 just below as the control); the full 19-assertion E2E suite still passes, and probe rows/users were cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-18 00:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Scrollable statusbar</code>: The footer status bar is now a single horizontally scrollable row — <code>#statusbar</code> gained <code>overflow-x: auto</code>, <code>overflow-y: hidden</code>, <code>overscroll-behavior-x: contain</code>, <code>scrollbar-width: thin</code>, and thin WebKit scrollbar rules (statusbar styles). Its children no longer shrink or ellipsize (<code>#table-count</code>/<code>#last-synchronization</code> dropped their <code>overflow: hidden</code>/<code>text-overflow: ellipsis</code> in favour of <code>flex-shrink: 0</code>), so a long readout stays reachable by scrolling the row instead of being clipped.</li>
          <li><code>Online indicator leads the row</code>: The online/offline indicator is now the <code>#statusbar</code>'s first (leftmost) child — the SSR markup was reordered to <code>#synchronization-status</code> → separator → <code>#table-count</code> → separator → <code>#last-synchronization</code> and the old <code>margin-left: auto</code> rule was dropped, putting the badge in the left corner (core <code>setOnlineStatus</code> is unchanged).</li>
          <li><code>Empty tab strip hidden</code>: While no table tab is open the tab strip collapses entirely — <code>.tab-strip:empty { display: none; }</code> (data_browser styles) — so the table pane shows only the "Select a table to view its rows." prompt; the strip reappears as soon as a table is opened and hides again when the very last tab is closed.</li>
          <li><code>README.md</code>: Updated the <code>Training UI chrome</code> overview bullet and the <code>statusbar/</code> and <code>data_browser/</code> file-breakdown rows, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile; the authenticated SSR dashboard serves the empty (hidden) <code>#tab-strip</code>, the reordered statusbar with <code>#synchronization-status</code> first, and the scrollable-row CSS; headless-Chrome CDP E2E (19 assertions) at 1280×1000 and 700×900 confirms the online indicator is the statusbar's first child in the left corner (left of <code>#table-count</code>), <code>overflow-x: auto</code> with injected long text actually overflowing and scrolling, the strip hidden while empty → visible with an open tab → hidden again after closing the last tab, plus query-run into the users tab and the small-screen full-fill tree toggle; probe users cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 20:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Touch-safe drag handles</code>: Both pane-split drag handles now survive a finger drag in DevTools mobile mode — the reported "handle sticks halfway" bug. <code>touch-action: none</code> on <code>.tree-drag-handle</code>/<code>.editor-drag-handle</code> (workspace styles) keeps the browser from claiming the gesture as a page scroll, and both drag scripts (<code>workspace/scripts.js</code>, <code>data_browser/scripts.js</code>) now <code>setPointerCapture</code> on the handle (guarded try/catch — synthetic pointer ids throw) plus a <code>pointercancel</code> listener that runs the same <code>stopDrag</code> cleanup as <code>pointerup</code>, so an aborted/cancelled drag can never leave <code>body.tree-resizing</code>/<code>body.editor-resizing</code> stuck or silently keep streaming moves.</li>
          <li><code>Online indicator in the statusbar</code>: The online/offline indicator moved out of the topbar into the footer statusbar — <code>#synchronization-status</code> (green/yellow/red dot + label, fed by core <code>setOnlineStatus</code>) now sits right-aligned in <code>section#statusbar</code> beside <code>#table-count</code> and <code>#last-synchronization</code>; the topbar right side is now just the circle avatar. The statusbar row gains a separator and the dot styles (statusbar component), and <code>topbar/index.js</code>/<code>styles.js</code> dropped the badge markup/rules.</li>
          <li><code>Real logout icon</code>: The profile page's icon logout button swapped the ambiguous power SVG for a door/arrow logout SVG (24×24 viewBox, <code>button button-danger button-icon</code>, no text label).</li>
          <li><code>Small-screen browser pane — no more overlay drawer</code>: Below 959px the tree pane is no longer a sliding drawer with a backdrop; the workspace stacks as a column and shows one full-size pane at a time. The tree pane starts hidden; the topbar ☰ button toggles core <code>browserOpen</code> (class <code>.workspace.browser-open</code>) which swaps in the tree pane to fill the whole workspace while the vertical column hides, and picking a table from the tree closes it again (<code>closeBrowserPane</code>). The <code>#browser-backdrop</code> div, its dim/fade styles, and the backdrop-click wiring were deleted; <code>applyBrowserDrawer</code>/<code>closeBrowserDrawer</code> were renamed <code>applyBrowserOpen</code>/<code>closeBrowserPane</code> in <code>_/helpers/core.js</code>, and <code>applyResponsiveLayout</code> still clears the inline tree width on narrow screens (the pane's size now comes from CSS alone, no CSS width needed for the "drawer").</li>
          <li><code>No default-opened tab</code>: The dashboard no longer force-opens <code>users</code> on first paint — <code>state.selectedTable = null</code>, core init skips the initial <code>loadTable</code> (schema + SSE only), <code>DEFAULT_TABLE</code> was removed from <code>core.js</code>, and the SSR dashboard (<code>dashboard/index.js</code> dropped <code>INITIAL_SCHEMA_TABLE</code> + the upfront <code>listTableData</code> call) renders an empty tab strip with the "Select a table to view its rows." placeholder. The footer statusbar starts at <code>No table selected</code> until the trainee opens one. <code>dataBrowserTree</code>/<code>dataBrowserTable</code> default <code>selectedTable</code> to <code>null</code> and the table pane builds its tab list from whatever the caller passes (empty by default).</li>
          <li><code>README.md</code>: Updated the overview bullets (<code>Server-rendered pages</code>, <code>Training UI chrome</code>), the project tree and file-breakdown rows (dashboard, data_browser, workspace, topbar, statusbar, profile_page), and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves an empty <code>#tab-strip</code>, the placeholder, <code>#table-count = No table selected</code> in the statusbar, the statusbar's right-aligned <code>#synchronization-status</code>, and zero backdrop markup with <code>touch-action: none</code> on both drag handles; the profile SSR carries the door/arrow SVGs; headless-Chrome CDP E2E (44 assertions) at 1280×1000 and 700×900 covers touch-action + a <code>pointercancel</code> mid-drag that leaves the pane sized and the resizing state cleared, the no-tab start, query-run into the users tab, tree/editor snap-to-zero and restore, the small-screen full-fill browser toggle (open → fill, table hidden; close → table back; tree pick closes it), and resize reconciliation clearing inline sizes; probe users cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 19:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Status bar restored</code>: The dashboard dropped the per-panel table summaries and brought back the footer status bar — a new <code>statusbar/</code> component (<code>section#statusbar</code>, <code>--statusbar-h: 28px</code> re-added to the container base layout) sits after the workspace and shows the selected table's live row count (<code>#table-count</code>, e.g. <code>users · 3 total · showing 50</code>) plus the last-synchronization readout (<code>#last-synchronization</code>). The core runtime gained <code>refreshStatusbar()</code>/<code>updateTableCount()</code>/<code>updateLastSynchronization()</code>/<code>markSynchronized()</code> (emitting <code>scheme:synchronized</code> after <code>loadSchema</code>/<code>loadTable</code> success, <code>runQuery</code> success, and <code>refreshAfterMutation</code>) and wires it into <code>renderDatabase()</code>; the statusbar script bridges the bus event to the readout and the dashboard SSR pre-renders the initial <code>users · 3 total · showing 50</code> count.</li>
          <li><code>data-summary removed</code>: The table-data summary line (<code>.data-summary</code>) is gone from both the server renderer (<code>data_browser/index.js</code> <code>renderDataMarkup</code>) and the client builders (<code>core.js</code> <code>queryResultMarkup</code>/<code>buildTableData</code>), along with its <code>data_browser/styles.js</code> rule — the statusbar above replaces it, so a table panel shows only the tab content again.</li>
          <li><code>Fully responsive dashboard</code>: A <code>window resize</code> listener (<code>applyResponsiveLayout</code>) reconciles breakpoint state — on small screens it clears a folded/overlay tree (<code>treePaneCollapsed=false</code>, inline tree width and <code>.is-snapping</code> cleared), and on wide screens it closes the drawer (<code>browserOpen=false</code>); both drag-handle scripts re-clamp their inline pane size against the current workspace size (tree width / editor <code>flex: 0 0 &lt;height&gt;px</code>, never leaving a pane hidden or oversized after a breakpoint change); the query editor hides its completion popup on resize; and the workspace got small-screen padding tweaks (8px, gap 5px).</li>
          <li><code>README.md</code>: Updated the <code>Training UI chrome</code> and <code>Route-scoped components</code> overview bullets, the project tree and file-breakdown rows (statusbar re-added; <code>query_editor/</code> and <code>workspace/</code> resize notes), and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 10 embedded-script blocks compile (<code>bun build --target=browser</code> — statusbar script added; a backtick in a core.js comment was breaking module load and is fixed); the authenticated SSR dashboard serves the statusbar with <code>#table-count</code> = <code>users · 3 total · showing 50</code> and <code>#last-synchronization</code> = <code>—</code>, with zero <code>data-summary</code> markup; headless-Chrome CDP E2E (36 assertions) covers login/SSR, query-run into the users tab, tab closing, drag snapping, the overlay drawer at 700px, and resize reconciliation — statusbar counts update and stale inline sizes clear after a resize; probe users cleaned up (baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 18:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Query results inside real table tabs</code>: The dedicated <code>query result</code> pseudo-tab is gone — a results-kind statement opens/reuses the table tab whose column set exactly matches the returned columns (<code>findQueryTable</code>: same column count, every result column a member of that table's column set; multiple matches → the active tab), and anything else renders in the active tab. Excel-data results never leave the table tab model, so the whole SQL <code>SELECT * FROM users</code> workflow maps straight into the users tab. <code>QUERY_TAB</code> and <code>queryResultActive</code> were removed from <code>server/external/_/helpers/core.js</code>; the panel switches back to a table's rows as soon as a real tab is picked, and closing the very last table tab is now allowed — the tab strip empties and the panel shows a "Select a table to view its rows." prompt instead of reopening <code>users</code>.</li>
          <li><code>Full-coverage snappable drags</code>: Both pane-split drag handles now resize their pane up to the whole column and shut the pane away below a 36px threshold — the tree handle (<code>data_browser/scripts.js</code>, <code>#tree-drag-handle</code>) rewrites <code>.pane-browser</code>'s inline width up to <code>workspaceWidth − 42px</code> (tree can cover the tabbed data pane completely) and snaps to <code>0px</code> below 36; the editor handle (<code>workspace/scripts.js</code>, <code>#editor-drag-handle</code>) rewrites <code>.pane-editor</code>'s inline <code>flex: 0 0 &lt;height&gt;px</code> up to <code>columnHeight − 18px</code> and snaps to <code>0px</code> below 36. The final slide is animated by <code>.is-snapping</code> (width/flex-basis 180ms ease), and both pill-shaped handles got rounded corners (<code>border-radius: 3px</code>). Re-expanding the collapsed tree (<code>toggleTreePane</code>) clears a drag-snapped inline width so the default 224px returns.</li>
          <li><code>Small-screen overlay drawer</code>: On screens ≤959px the workspace stacks as a column and the tree pane becomes an overlay drawer (<code>.workspace-vertical</code> fills the pane): the pane slides in over the vertical column at 264px / 80vw with a shadow (<code>.workspace.browser-open</code>), a dim <code>#browser-backdrop</code> (z-index 20, rgba(16,24,40,0.32)) fades in behind it and closes it on click (<code>SchemeApp.closeBrowserDrawer</code>), and picking a table from the tree closes it too. The topbar ☰ button toggles <code>state.browserOpen</code> (<code>isSmallScreen</code> gating replaces the old 160px tree strip), <code>#tree-drag-handle</code> is hidden, and the <code>tree-collapsed</code> state on wide screens still hides the tree outright.</li>
          <li><code>README.md</code>: Updated the overview paragraph and the <code>data_browser/</code> and <code>workspace/</code> file-breakdown rows for the table-tab result model, the snappable drags, and the drawer; recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>; a backtick inside a workspace CSS comment was breaking the module at boot and is fixed); the authenticated SSR dashboard serves the three panes, both rounded handles, and the backdrop div; headless-Chrome CDP (27 assertions) at 1280×1000 — <code>SELECT * FROM users LIMIT 3</code> leaves the users tab active with a data summary and no <code>query result</code> tab, closing every visible tab empties the strip (placeholder + <code>selectedTable</code> null), both handles snap their pane to 0px and back when toggled (tree restored to ~224px), and the handles report <code>border-radius: 3px</code>; at 700×900 — workspace stacks as a column, the tree handle hides, the drawer starts translated off-screen with a faded click-through backdrop, <code>toggleTreePane</code>/☰ opens it (<code>browser-open</code> + visible backdrop), clicking the backdrop closes it, and picking <code>users</code> from the tree closes the drawer and opens the tab. Probe users were cleaned up (remaining baseline: <code>administrator</code>, <code>smoke_test</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 17:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Three-pane workspace</code>: The dashboard dropped the two full-width stacked panes — <code>workspace({ left, rightTop, rightBottom })</code> now renders a row: the data browser's schema tree on the left (<code>.pane-browser</code>, static 224px), a draggable <code>#tree-drag-handle</code>, and a <code>.workspace-vertical</code> column stacking the tabbed data pane (<code>.pane-table</code>) over the SQL editor (<code>.pane-editor</code>), separated by <code>#editor-drag-handle</code>. The data browser component split into <code>dataBrowserTree()</code> (the tree pane, embeds styles + script) and <code>dataBrowserTable()</code> (the tabbed pane, markup only) so the workspace can place them in different panes, and the DATABASE / SQL EDITOR subheadings were removed entirely.</li>
          <li><code>Draggable splits</code>: <code>workspaceScript</code> wires both handles from pointer events — the tree handle rewrites <code>.pane-browser</code>'s inline width (clamped 140–420px), the editor handle rewrites <code>.pane-editor</code>'s inline <code>flex: 0 0 &lt;height&gt;px</code> (clamped 120px…column height − 120), and <code>body.tree-resizing</code>/<code>body.editor-resizing</code> hold the resize cursor during a drag. Tree collapse moved onto the workspace level: <code>.workspace.tree-collapsed</code> hides <code>.pane-browser</code> + <code>#tree-drag-handle</code> (toggled by the topbar ☰ button), and the small-screen accordion is gone — below 959px the workspace stacks as a column with the tree as a full-width 160px strip and the vertical column filling the rest.</li>
          <li><code>Editor chrome</code>: The <code>query_editor</code> pane renders directly inside the pane (no subheading) — <code>#editor-diagnostics</code> is now an absolute popup (top-right, max-height 150px) that appears only while the code is dirty and is hidden by Escape; completions open <em>below</em> the caret line (flipping above when there is no room) and no longer clip against the pane bottom; the runtime error strip sits above a right-aligned <code>.editor-toolbar</code> (Run query / Clear, with the shortcut text on the left).</li>
          <li><code>Profile icon buttons</code>: The shared <code>button</code> element gained the <code>labelHtml</code> option (raw HTML overrides the escaped label) and a circular <code>.button-icon</code> variant (32×32, border-radius 50%, 16×16 inline SVG); the profile page's back button is now an arrow-left icon anchor (<code>button button-ghost button-icon</code>) and its logout button a power icon (<code>button button-danger button-icon</code>) with no text label.</li>
          <li><code>README.md</code>: Updated the overview paragraph, the <code>Button element</code> and <code>Training UI chrome</code> bullets, the project tree (workspace script row), the file-breakdown rows (button, data_browser, query_editor, workspace, profile_page), and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves the three panes + both drag handles with no subheadings, and the profile SSR carries the two icon buttons; headless-Chrome CDP at 1280px — layout row with the tree left of the vertical column and the table pane above the editor, editor drag sets <code>flex: 0 0 220px</code>, the ☰ button collapses the tree (<code>display: none</code>) and re-expands it, tree drag resizes 224px → 320px (clamped), the unbalanced-paren <code>SELECT &hellip; (1</code> shows the popup with "Unbalanced parentheses — 1 open." and Escape hides it, <code>SEL</code> opens the completion popup below the caret (typed text preserved), <code>SELECT * FROM users</code> creates a <code>query result</code> tab while <code>SELEC * FROM missing_table</code> renders <code>#editor-error</code> above the toolbar, the profile icon buttons both carry 16px SVGs, and a guest <code>/dashboard</code> redirects to <code>/login</code>; at 700px the workspace stacks as a column with the tree strip and all controls usable.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 16:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Workspace chrome</code>: The dashboard dropped the footer statusbar — the <code>statusbar/</code> component and the core runtime's statusbar-only plumbing (<code>updateTableCount</code>, <code>updateLastSynchronization</code>, the <code>scheme:synchronized</code> bus emits) were deleted, and the <code>--statusbar-h</code> variable left the <code>container</code> base layout. The topbar right side now carries just the online status indicator plus a single circle avatar with the user's initial; pressing the avatar navigates to the new private <code>/profile</code> page.</li>
          <li><code>Topbar nav button</code>: The topbar left gained a stack button (☰, <code>data-action="toggle-tree"</code> through the shared <code>button</code> component) that collapses/expands the table tree — core state <code>treePaneCollapsed</code> + <code>SchemeApp.toggleTreePane</code> toggle <code>.tree-collapsed</code> on the <code>.database</code> container so re-renders cannot resurrect the tree.</li>
          <li><code>Collapsible + resizable tree</code>: The file-browser tree stays scrollable on demand and is now horizontally resizable — a drag handle (<code>#tree-drag-handle</code>) between the tree and the data view rewrites the tree's inline width from pointer events, clamped 140–420px, with <code>body.tree-resizing</code> keeping the resize cursor during a drag. Empty tables open as normal tabs: with no rows the tab renders its PRAGMA column headers plus a "No rows" row.</li>
          <li><code>Profile page</code>: New file-based <code>/profile</code> route (<code>server/external/profile/</code>) — private like the dashboard (guests redirect to <code>/login</code>), served in <code>container()</code> without the core runtime. The <code>profile_page</code> component renders a top bar (back button → <code>/dashboard</code> on the left, logout on the right) and a centered card with a large circle avatar + the username; its self-contained script posts to <code>/api/authentication/logout</code>, clears <code>scheme_token</code> from localStorage and the cookie, and redirects to <code>/login</code>.</li>
          <li><code>README.md</code>: Updated the overview bullets (<code>Server-rendered pages</code>, <code>Route-scoped components</code>, <code>Button element</code>, new <code>Training UI chrome</code>), the project tree, the architecture-diagram SSR line, and the file-breakdown rows (button, data_browser, topbar, profile, dashboard) — the statusbar row was removed; recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves the avatar + toggle button + drag handle with no <code>#statusbar</code>/user-info/logout; the profile page 200s with avatar initial + name and guests 302 → <code>/login</code>; headless-Chrome CDP at 1280px — avatar initial <code>U</code>, <code>CREATE TABLE empty_demo</code> opens a tab with headers + <code>No rows</code>, the toggle button collapses the tree (<code>display: none</code>) and re-expands it, dragging the handle resizes 224px → 320px (clamped), avatar → <code>/profile</code> → back → <code>/dashboard</code> → avatar → logout clears token + cookie and lands on <code>/login</code>, and a guest <code>/dashboard</code> redirects to <code>/login</code>.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 15:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Tab-based data browser</code>: The database pane no longer uses a collapsible accordion — it splits horizontally into a file-browser table tree (left) and a tabbed data view (right). The tree lists every table/view as an item with an expandable column listing (caret <code>▸/▾</code>) and a row-count badge; clicking an item opens that table as a tab. The right side owns the tab strip (<code>#tab-strip</code>, one tab per open table) and the tab panel (<code>#tab-panel</code>) rendering the active table's rows as an HTML table. Closing the active table tab activates its neighbor or reopens <code>users</code>; clicking a table clears the last query's view.</li>
          <li><code>Query results as a tab</code>: SQL results always arrive in a dedicated <code>query result</code> pseudo-tab (<code>QUERY_TAB</code> — SQLite table names cannot contain a space, so the marker is unambiguous) rendered ahead of the table tabs; closing it falls back to the last open table. Runtime SQL failures still do not render in the pane — they surface in the error strip below the SQL editor.</li>
          <li><code>Files</code>: <code>data_browser/index.js</code> server-renders the tree, the initial <code>users</code> tab, and its data (<code>renderTreeMarkup</code>/<code>renderTabsMarkup</code>/<code>renderPanelMarkup</code>); the core runtime (<code>_/helpers/core.js</code>) gained the matching client builders (<code>renderSchemaTree</code>/<code>renderTabs</code>/<code>renderTabPanel</code>/<code>renderDatabase</code>), the tab state model (<code>openTabs</code>, <code>tableCache</code>, <code>expandedTables</code>, <code>queryResultActive</code>), the tab management actions (<code>activateTab</code>, <code>closeTab</code>, <code>toggleTreeTable</code>, <code>selectTableAt</code>), and exposes them on <code>window.SchemeApp</code>; <code>data_browser/scripts.js</code> event-delegates tree and tab clicks; <code>data_browser/styles.js</code> owns the tree/tab/panel layout with a narrow-screen shrink at 719px; <code>refreshAfterMutation</code> reloads every open tab after <code>data:changed</code>.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves <code>#schema-tree</code> + <code>#tab-strip</code> + <code>#tab-panel</code> with the users tab open and its rows embedded; headless-Chrome CDP at 1280px — tree caret expands a table's columns, two more tables open as tabs, a <code>SELECT</code> produces a <code>query result</code> tab (subtitle <code>Query result</code>), closing it falls back to the last open table, closing the active table activates its neighbor; an invalid statement renders <code>SQL error: near "SELEC": syntax error</code> in <code>#editor-error</code> and creates no tab; at 480px the pane-heading click still expands the data pane and folds the editor.</li>
          <li><code>README.md</code>: Updated the overview paragraph, the <code>Server-rendered pages</code> bullet, the <code>data_browser/</code>, <code>dashboard/</code>, and <code>workspace/</code> file-breakdown rows, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 14:40:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Canonical synchronization_log column order</code>: The audit table now follows a fixed column order — <code>id</code>, <code>created_at</code>, <code>synchronized_at</code>, <code>operation</code>, <code>user_id</code>, <code>source_ip</code>, <code>user_agent</code> — in fresh creates and upgraded databases alike. Because SQLite cannot reorder columns with <code>ALTER TABLE</code>, <code>migrations.js</code> compares the physical order against the canonical list at boot and rebuilds the table (<code>CREATE TABLE synchronization_log_rebuild</code> → copy rows with <code>COALESCE(created_at, datetime('now'))</code> → <code>DROP</code> → <code>RENAME</code>) when it differs; once the orders match the step is skipped.</li>
          <li><code>synchronized_at verified working</code>: The pending/acknowledge flow survives the rebuild — <code>GET /api/synchronization/pending</code> listed the sole entry (<code>id 9</code>, <code>userId 33</code>) with <code>synchronizedAt: null</code>, <code>POST /api/synchronization/acknowledge</code> answered <code>acknowledged: 1</code>, and the row's <code>synchronized_at</code> was stamped. Data (operation, user, IP, agent, created_at, id sequence) is preserved across the rebuild, and a fresh database creates the table in the same canonical order.</li>
          <li><code>README.md</code>: Updated the persistence file-breakdown row and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 13:40:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Lean audit trail</code>: The <code>synchronization_log</code> table now carries the six audit columns — <code>id</code>, <code>created_at</code>, <code>operation</code> (the SQL statement text), <code>user_id</code>, <code>source_ip</code>, and <code>user_agent</code> — plus the <code>synchronized_at</code> marker backing the pending/acknowledge flow (kept per review, renamed from <code>synced_at</code>). The execution facts (<code>changes</code>, <code>last_insert_rowid</code>, <code>duration_ms</code>) and the redundant <code>statement</code> column are gone; the synchronization microservice records <code>operation = payload.statement</code> and no longer persists execution facts.</li>
          <li><code>In-place migration</code>: Existing logs are upgraded without data loss — <code>synced_at</code> is renamed to <code>synchronized_at</code>, <code>operation</code> absorbs the old <code>statement</code> column (<code>UPDATE &#8230; SET operation = statement</code>), the execution-fact columns are dropped via a new <code>dropColumnIfExists</code> helper, and the legacy JSON <code>payload</code> is still folded into <code>operation</code> (<code>json_extract(payload, '$.statement')</code>) for older payload-shaped databases.</li>
          <li><code>Repositories + service</code>: <code>mapSynchronizationEntry</code> and the prepared statements now select/insert only the audit columns plus <code>synchronized_at</code>; <code>pending</code> queries <code>WHERE synchronized_at IS NULL</code> and <code>acknowledge</code> stamps <code>synchronized_at = datetime('now')</code> — both public endpoints and the SSE sanitized reload (<code>keyword</code>/<code>changes</code>/<code>lastInsertRowid</code>/<code>durationMs</code>) are unchanged.</li>
          <li><code>README.md</code>: Updated the <code>Synchronization log</code> overview bullet, architecture-diagram SQLite block and audit description, API reference (<code>/api/synchronization/pending</code> field list), and file-breakdown rows (persistence, synchronization service); recorded this change in the changelog.</li>
          <li><code>Verification</code>: Live DB with the rich audit shape upgraded in place — old rows kept their <code>operation</code> folded from <code>statement</code> plus <code>user_id</code>/<code>source_ip</code>/<code>user_agent</code>; a fresh authenticated <code>INSERT</code> over <code>POST /api/queries</code> appended an audit row with <code>operation</code> = the full SQL text and <code>userId</code>, <code>sourceIp</code>, <code>userAgent</code> captured; <code>pending</code> listed it as <code>synchronizedAt: null</code>, <code>acknowledge</code> stamped it and answered <code>acknowledged: 1</code>; the SSE stream still emits only the sanitized <code>data:changed</code> frame; probe rows cleaned up.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 12:50:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Combined feedback panel</code>: The <code>query_editor</code> pane unifies the runtime error output and the live lint strip in one scrollable panel — the markup now wraps <code>#editor-error</code> and <code>#editor-diagnostics</code> in <code>&lt;div class="editor-feedback"&gt;</code>, capped at 190px (<code>max-height</code>, <code>overflow-y: auto</code>, <code>overscroll-behavior: contain</code>) so long errors and many lint lines scroll inside the panel instead of growing the pane.</li>
          <li><code>Toolbar pinned to the pane bottom</code>: <code>.editor-toolbar</code> (Run query / Clear) is the last flex child of the editor pane with <code>flex-shrink: 0</code>, and <code>.editor-shell</code> changed from a fixed <code>min-height: 160px</code> to a collapsible <code>flex: 1 1 0; min-height: 0</code> — combined with the capped feedback panel, the Run SQL toolbar can no longer be pushed below the pane's clipped bottom edge (workspace <code>.pane</code> uses <code>overflow: hidden</code>), which was making it disappear once the diagnostics strip became always visible.</li>
          <li><code>Styling</code>: The runtime error row is now a light danger-tinted block (<code>#fef2f2</code> background, <code>var(--c-danger)</code> text, bottom border) sitting above the lint strip inside the shared light panel (<code>#f8fafc</code>), replacing the old dark <code>var(--c-danger-bg, #2b1216)</code> error strip; doc comments in <code>query_editor/index.js</code>, <code>styles.js</code>, and <code>scripts.js</code> describe the combined panel.</li>
          <li><code>README.md</code>: Updated the <code>query_editor/</code> file-breakdown row and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>); headless-Chrome CDP at 1280px — toolbar visible at the pane bottom (1px from the pane edge) with the sample lint line and a hidden error; running an invalid statement puts <code>SQL error: no such table: &#8230;</code> in <code>#editor-error</code> inside the feedback panel above the diagnostics with the toolbar still pinned; injecting 25 long lint lines makes the panel scroll (<code>scrollHeight &gt; clientHeight</code>, client height 189px vs the 190px cap) while the toolbar stays visible; restoring clean SQL returns the sample and hides the error; at 480px the toolbar is visible when the editor pane is active and correctly hidden when the accordion folds it.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 12:40:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Diagnostics sample line</code>: The <code>#editor-diagnostics</code> lint strip under the SQL editor now always displays a <code>.diag-sample</code> explainer while the code is clean, so its purpose is clear without typing — "Live lint — unterminated strings, unbalanced parentheses, and open block comments are reported here." Real diagnostics replace the sample on the next edit and return it when the code is clean again.</li>
          <li><code>Hidden-attribute fix</code>: The strip previously rendered as an unexplained dark bar because the base <code>.editor-diagnostics</code> rule set <code>display: flex</code> unconditionally, which neutralised the <code>hidden</code> attribute (author <code>display</code> beats the UA <code>[hidden]</code> rule). The base rule no longer declares <code>display</code>; visibility lives only in <code>.editor-diagnostics:not([hidden])</code>. The strip was also converted from the dark danger background (<code>var(--c-danger-bg, #2b1216)</code>) to a light panel (<code>#f8fafc</code>) matching the white editor, with dark-on-light lint colours (<code>.diag-warn #b45309</code>, <code>.diag-error var(--c-danger)</code>) and a muted italic sample line; the runtime <code>#editor-error</code> strip keeps its dark critical styling.</li>
          <li><code>Markup</code>: <code>query_editor/index.js</code> now server-renders the sample line inside the diagnostics strip instead of an empty hidden div; <code>query_editor/scripts.js</code> always renders either the real diagnostics or the sample line, and the component/script doc comments describe the behaviour.</li>
          <li><code>README.md</code>: Updated the <code>query_editor/</code> file-breakdown row and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves <code>&lt;div class="diag diag-sample"&gt;</code> inside <code>#editor-diagnostics</code> (no <code>hidden</code>, light background); headless-Chrome CDP at 1280px — initial state shows the visible light strip with the sample line and <code>#editor-error</code> hidden, entering <code>SELECT * FROM users WHERE id = (1</code> swaps the sample for <code>.diag-warn</code> "Unbalanced parentheses — 1 open.", an unterminated string shows "Unterminated string literal.", and restoring clean SQL returns the sample line.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 12:10:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Vertical workspace</code>: Replaced the horizontal split with a vertical layout — the data browser (schema accordion + live table data) now sits on top and the SQL editor below at every width: a static 58/42 vertical split on wide screens, and below 960px both panes keep the vertical layout at full width and become an accordion without tabs — the active pane fills the available height (<code>flex: 1</code>) while the inactive pane folds down to just its heading (its other children are hidden). The workspace component (<code>workspace/index.js</code>) dropped the tab bar and only renders the pane headings as accordion handles; <code>workspace/scripts.js</code> replaced the tab switcher with <code>SchemeApp.activateWorkspacePane(name)</code> — heading clicks expand that pane and fold the other, focus-follow keeps the matching pane expanded (editor textarea, or the schema panel after a data-browser section click), and the interactions are <code>matchMedia</code>-gated so wide screens stay static.</li>
          <li><code>Results-first small screens</code>: The core runtime (<code>server/external/_/helpers/core.js</code>) calls <code>activateWorkspacePane("data")</code> after every successful SQL run on small screens — the database pane expands (and the editor folds) so the freshly run query's results are immediately visible without a manual toggle.</li>
          <li><code>Layout CSS</code>: <code>workspace/styles.js</code> switched <code>.workspace</code> to <code>flex-direction: column</code>, removed the <code>.workspace-tabs</code>/<code>.workspace-tab</code> rules, and owns the small-screen accordion — folded panes shrink to their heading (<code>flex: 0 0 auto</code>), the active pane grows to fill, non-heading children of a folded pane are hidden, and the pane-title caret swaps <code>▸</code>/<code>▾</code> (the <code>container</code> base variables keep the colours).</li>
          <li><code>README.md</code>: Updated the overview paragraph, the <code>workspace/</code>, <code>query_editor/</code>, and <code>data_browser/</code> file-breakdown rows, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves the data browser pane before the editor pane (<code>&lt;section class="pane pane-data"&gt;</code> then <code>&lt;section class="pane pane-editor is-active"&gt;</code>), no tab bar, and the vertical/accordion CSS; the server still renders <code>/dashboard</code> and redirects guests.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 11:38:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Small-screen tab switcher</code>: Replaced the <code>workspace</code> horizontal accordion with a real tab behavior — wide screens keep the static 42/58 split, and below 960px a tab bar ("SQL Editor" / "Database") reveals one pane at a time. The workspace component (<code>workspace/index.js</code>) renders the tab bar (buttons with <code>data-tab-target</code>, <code>role="tab"</code>, <code>aria-selected</code>) and embeds a new <code>workspaceScript</code> (<code>workspace/scripts.js</code>) that toggles <code>is-active</code> on the tabs and the panes on click and follows focus into a pane (editor textarea, or the data browser's schema panel after a section click) so the matching tab stays active. The pane sections themselves now carry <code>data-pane="editor"</code>/<code>data-pane="data"</code> attributes (<code>query_editor/index.js</code>, <code>data_browser/index.js</code>), and the editor pane ships <code>is-active</code> in the SSR markup as the default tab.</li>
          <li><code>Tab layout CSS</code>: <code>workspace/styles.js</code> dropped the <code>:focus-within</code> flex-grow accordion rules and the unused <code>transition: flex-grow</code>; the overwritten <code>.workspace-tabs</code> bar (hidden on wide screens, <code>display: flex</code> below 960px) and <code>.workspace-tab</code> underline-style buttons use the <code>container</code> base variables (<code>--c-primary</code>, <code>--c-border</code>, <code>--c-text-muted</code>). On small screens <code>.pane</code> is hidden unless <code>.pane.is-active</code>, which fills the remaining height with <code>flex: 1</code> so the inactive pane never steals height.</li>
          <li><code>data_browser comments</code>: The <code>data_browser/scripts.js</code> focus comment and the <code>data_browser/styles.js</code> <code>.schema-panel:focus</code> comment now name the small-screen tab switcher instead of the retired horizontal accordion.</li>
          <li><code>README.md</code>: Updated the <code>workspace/</code> and <code>data_browser/</code> file-breakdown rows, added <code>workspace/scripts.js</code> to the project-structure tree, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 9 embedded-script blocks compile (<code>bun build --target=browser</code>, workspace script added to the harness); the authenticated SSR dashboard serves the tab bar (<code>class="workspace-tab is-active" data-tab-target="editor"</code>), the <code>data-pane</code> sections, and the tab CSS; the server still renders <code>/dashboard</code> and redirects guests.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 10:56:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Small-screen horizontal accordion</code>: The <code>workspace</code> now lays the query editor and data browser side by side at every width. Wide screens keep the static 42/58 split; below 960px the workspace becomes a horizontal accordion — both panes keep their full height (<code>align-items: stretch</code>; <code>flex-grow</code> transitions) and the focused pane widens via <code>:focus-within</code> (<code>flex-grow: 3</code> vs <code>1</code>) while the other narrows but never loses height. The editor activates naturally when its textarea is focused; the data browser's <code>#schema-panel</code> gained <code>tabindex="-1"</code> and the component script focuses the panel container (not a child) on section clicks, so the data pane stays marked active across the core runtime's innerHTML re-renders.</li>
          <li><code>Accordion sections never shrink</code>: <code>.schema-section</code> in <code>data_browser/styles.js</code> became <code>flex: 0 0 auto</code> — expanding/selecting one table no longer compresses the other table sections; the <code>.schema-panel</code> scrolls instead. A <code>.schema-panel:focus</code> rule hides the browser's focus ring for the programmatic accordion activation.</li>
          <li><code>README.md</code>: Updated the <code>workspace/</code> and <code>data_browser/</code> file-breakdown rows for the horizontal accordion and the non-shrinking sections; recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 8 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves the row-first <code>.workspace</code>, the focusable <code>tabindex="-1"</code> schema panel, and the <code>flex: 0 0 auto</code> accordion sections; the server still renders <code>/dashboard</code> and redirects guests.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 10:21:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Editor feedback stacking</code>: The <code>query_editor</code> pane no longer sandwiches the toolbar between the feedback strips — <code>#editor-error</code> and <code>#editor-diagnostics</code> now stack together directly below the editor shell (error strip first, then the live lint strip), and the <code>.editor-toolbar</code> anchors the bottom of the pane with the Run query / Clear buttons flush against the left edge. The toolbar previously sat between the two strips (<code>editor-shell → error → toolbar → diagnostics</code>), which placed the diagnostics visually at the toolbar; the server-side markup in <code>query_editor/index.js</code> was reordered to <code>editor-shell → error → diagnostics → toolbar</code> and the component doc comment now names both strips while the core runtime still writes only <code>#editor-error</code> and the editor script only <code>#editor-diagnostics</code>.</li>
          <li><code>README.md</code>: Recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 8 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard renders the strips in order (<code>id="editor-error"</code> at 40231, <code>id="editor-diagnostics"</code> at 40291, <code>class="editor-toolbar"</code> at 40363, no stray diagnostics after the toolbar); throwaway <code>layout_check</code> user cleaned up.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 10:19:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Editor toolbar flush to the pane edge</code>: The <code>query_editor</code> Run query section no longer floats inside the pane — <code>.editor-toolbar</code> dropped its horizontal inset (<code>padding: 8px 12px</code> → <code>8px 0</code>) so the Run query / Clear buttons sit flush against the SQL editor pane's left border (the shortcut keeps a small <code>padding-right: 12px</code> so its text does not touch the right border).</li>
          <li><code>Plain white editor background</code>: The SQL editor shell is now plain white (<code>background: #ffffff</code>), replacing the dark navy (<code>var(--c-editor, #0f172a)</code>). To stay readable on the light surface the syntax highlight tokens were converted from the light-on-dark Material palette to a dark-on-light palette (<code>.tok-keyword #7c3aed</code>, <code>.tok-string #15803d</code>, <code>.tok-table #1d4ed8</code>, <code>.tok-operator #b45309</code>, <code>.tok-comment #6b7280</code>, <code>.tok-number #c2410c</code>, <code>.tok-ident #111827</code>), the caret fallback became <code>var(--c-primary, #2563eb)</code>, and the selection highlight switched to <code>rgba(37, 99, 235, 0.25)</code>.</li>
          <li><code>README.md</code>: Recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 8 embedded-script blocks compile (<code>bun build --target=browser</code>); the authenticated SSR dashboard serves <code>background: #ffffff</code>, <code>padding: 8px 0</code>, and the <code>editor-toolbar</code> markup; no <code>--c-editor</code>/<code>#0f172a</code>/legacy dark-token references remain in <code>server/</code>; throwaway <code>ui_check</code> user cleaned up (audit rows nulled via <code>ON DELETE SET NULL</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 10:20:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Runtime query errors below the editor</code>: SQL failures no longer render as <code>query failed</code> pseudo-sections at the top of the right-pane accordion — they surface in a dedicated error strip (<code>#editor-error</code>) directly below the SQL editor in the left pane. The query editor component (<code>query_editor/index.js</code>) gained the markup between the editor shell and the toolbar; <code>query_editor/styles.js</code> owns the strip styling (danger border, mono type, wrap-anywhere) on the <code>container</code> base variables; and the core runtime's <code>setEditorError(message)</code>/<code>clearQueryError()</code> helpers render and clear it while <code>renderQueryError</code> keeps the accordion on the selected table's normal schema view. The data browser lost its <code>.query-error-section</code>/<code>.query-error</code> styles and the click guard for error pseudo-sections; query-result pseudo-sections still render in the accordion unchanged. Typing (or clearing) in the editor clears a stale error immediately; a successful query or explicit table browse does too.</li>
          <li><code>README.md</code>: Updated the <code>query_editor/</code> and <code>data_browser/</code> file-breakdown rows for the error-strip placement; recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 8 embedded-script blocks still compile (<code>bun build --target=browser</code>); an invalid statement over the live sandbox (<code>SELEC * FROM missing_table</code>) renders the engine error in <code>#editor-error</code> below the editor and the right pane shows the plain schema accordion with no <code>query failed</code> section; correcting the editor clears the strip before the next Ctrl+Enter run.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 09:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Expanded synchronization_log audit trail</code>: The sync log dropped its opaque JSON <code>payload</code> column in favor of typed audit columns — <code>statement</code> (full SQL text), <code>user_id</code> (nullable FK to <code>users</code>, <code>ON DELETE SET NULL</code>), <code>changes</code>, <code>last_insert_rowid</code>, <code>duration_ms</code>, <code>source_ip</code>, and <code>user_agent</code>, plus indexes on <code>user_id</code>/<code>synced_at</code>. The migration is in-place: existing sync tables are upgraded with <code>ALTER TABLE ADD COLUMN</code>, their JSON <code>payload</code> is migrated into the typed columns (<code>json_extract</code>), and the column is dropped afterward; only the unrecoverable grid-era shape (<code>record_id</code>) is dropped and rebuilt. <code>repositories.js</code> inserts/selects the new columns; <code>mapSynchronizationEntry</code> exposes them as <code>userId</code>/<code>lastInsertRowid</code>/<code>durationMs</code>/<code>sourceIp</code>/<code>userAgent</code>.</li>
          <li><code>Richer data.changed events</code>: The queries service <code>execute(sql, audit)</code> now accepts audit metadata (<code>userId</code>, <code>sourceIp</code>, <code>userAgent</code>) from the HTTP adapter and publishes the full statement text, keyword, changed rows, last rowid, and duration in the <code>data.changed</code> domain payload; the synchronization service persists the whole entry into the expanded columns. The streaming service broadcasts a sanitized subset (<code>keyword</code>/<code>changes</code>/<code>lastInsertRowid</code>/<code>durationMs</code>) so no statement text or user details leak to other SSE clients.</li>
          <li><code>Request provenance</code>: <code>POST /api/queries</code> records the acting user (<code>context.state.session</code>), the resolved client address, and the user agent; the composition root threads Bun's <code>server.requestIP(request)</code> into the request context (<code>createContext(request, { remoteAddress })</code>).</li>
          <li><code>Session mapping fix</code>: The session repository's <code>selectByToken</code> ran <code>SELECT *</code>, returning SQLite's snake_case columns, while <code>mapSession</code> read <code>row.userId</code>/<code>row.expiresAt</code> — so <code>session.userId</code> had silently always been <code>undefined</code> (the lazy session cache on <code>me()</code> masked it). The query now selects explicit aliases (<code>user_id AS userId</code>, <code>expires_at AS expiresAt</code>, <code>created_at AS createdAt</code>) so the audit trail records the real acting user.</li>
          <li><code>README.md</code>: Updated the <code>Synchronization log</code> overview bullet, architecture diagram (sanitized SSE reload, structured audit trail), API reference (<code>/api/synchronization/pending</code> field list), and file-breakdown rows (<code>persistence/</code>, <code>queries.js</code>, <code>streaming.js</code>, <code>synchronization.js</code>); recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 8 embedded-script blocks compile (<code>bun build --target=browser</code>); a live DB with the old <code>operation</code>/<code>payload</code> shape upgraded in place — the legacy row survived and its <code>statement</code>/<code>changes</code>/<code>last_insert_rowid</code> were backfilled while <code>payload</code> was dropped; an authenticated <code>INSERT</code> over <code>POST /api/queries</code> appended an audit row carrying the full SQL, <code>userId</code> (3), <code>sourceIp</code> (<code>127.0.0.1</code>), and <code>userAgent</code>; the SSE stream emitted only the sanitized <code>data:changed</code> reload (<code>keyword</code>/<code>changes</code>/<code>lastInsertRowid</code>/<code>durationMs</code>) with no statement or user data; deleting a user nullifies its audit rows (<code>ON DELETE SET NULL</code>) and <code>/api/synchronization/pending</code> + <code>acknowledge</code> still work.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 08:56:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Legacy layer removed</code>: Dropped the retired spreadsheet grid — the <code>records</code> table, its repository and microservice (<code>server/internal/services/records.js</code> deleted), every <code>/api/records*</code> adapter (list, single cell, row fetch/add/delete, cell upsert), the row/record <code>record.*</code>/<code>row.*</code> domain events, and the <code>record:</code>/<code>row:</code> SSE wire events are gone. The unrestrictable SQL sandbox remains the single write path, and the client runtime dropped <code>apiPut</code>/<code>apiDelete</code> and its records event subscriptions.</li>
          <li><code>Application tables renamed</code>: Migrations now rename legacy tables in place via <code>renameTableIfExists</code> — <code>_users</code> → <code>users</code>, <code>_sessions</code> → <code>sessions</code>, <code>_synchronization_log</code> → <code>synchronization_log</code> (and the older flat <code>sync_log</code> first) — then drop the retired <code>records</code> table and recreate the sync log without its legacy <code>record_id</code> foreign key. <code>repositories.js</code> no longer maps records; the synchronization repository uses <code>operation</code>/<code>payload</code> rows only and <code>markSynced</code> targets the current table. The synchronization and streaming services now subscribe solely to <code>data.changed</code> (audit + SSE <code>data:changed</code> reload).</li>
          <li><code>Dashboard defaults moved to users</code>: The SSR dashboard (<code>server/external/dashboard/index.js</code>) selects <code>users</code> as the initial schema table (<code>INITIAL_SCHEMA_TABLE</code>, <code>INITIAL_QUERY = "SELECT * FROM users LIMIT 25;"</code>); the core runtime's <code>DEFAULT_TABLE</code> became <code>"users"</code>; the data browser's default selection followed. The statusbar now renders the selected table's live row count (<code>#table-count</code>, fed by the renamed <code>updateTableCount(table, total)</code>) next to the last-synchronization readout, and the query editor's placeholder example is <code>SELECT * FROM users LIMIT 25</code>.</li>
          <li><code>README.md</code>: Updated the overview bullets (SQLite tables, microservice list/events, SQL sandbox table names, SSE reload signal, synchronization log), the naming-convention event example, the project-structure tree (no <code>records.js</code>), the architecture diagram (event bus + SQLite tables), the API reference (records rows removed), and the file-breakdown rows (dashboard, statusbar, persistence migrations, services); recorded this change in the changelog at the top.</li>
          <li><code>Verification</code>: All 7 embedded-script blocks still compile (<code>bun build --target=browser</code>); fresh-DB boot runs migrations only and lists <code>users</code>/<code>sessions</code>/<code>synchronization_log</code> in <code>GET /api/schema</code>; registration + <code>SHOW TABLES</code>-equivalent schema fetch, <code>SELECT * FROM users</code> returning the signed-in user, a mutation (<code>UPDATE users ...</code>) reporting changes with a <code>data.changed</code> SSE frame and a <code>synchronization_log</code> audit row all pass; records endpoints return 404.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 10:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Best-effort IndexedDB cache</code>: Fixed the intermittent <code>Failed to load table …</code> toast that appeared every time an accordion section was expanded in real browsers. The old spreadsheet client created the <code>scheme</code> database at version 1 with a <code>records</code> store (keyPath <code>id</code>); the SQL training ground reuses the same name at the same version for a different <code>cache</code> store (keyPath <code>key</code>), so <code>onupgradeneeded</code> never fired for those users and every <code>idbPut</code>/<code>idbGet</code> threw <code>NotFoundError</code> — the toast masked a perfectly successful network load. <code>IDB_VERSION</code> was bumped to 2 in <code>server/external/_/helpers/core.js</code> so applying users upgrade their existing database and gain the <code>cache</code> store.</li>
          <li><code>Non-fatal cache operations</code>: The temporary cache is now strictly best-effort as documented. <code>loadSchema</code>/<code>loadTable</code> render the freshly fetched network data and report <code>online</code> before attempting the cache write, and the write is wrapped so a cache failure can never fail a successful load (the <code>Failed to load …</code> toast now only appears when the network request fails <em>and</em> no cached snapshot is available). Network failures still fall back to the cached snapshot and mark the status <code>offline</code>.</li>
          <li><code>Verification</code>: All 7 embedded-script blocks compile (<code>bun build --target=browser</code>); headless-Chrome CDP repro seeded a legacy v1 <code>records</code>-store database and confirmed v1 produced the exact user symptom (<code>Failed to load schema</code> + <code>Failed to load table records</code> on load, <code>Failed to load table …</code> on every expand, yet <code>hasData: true</code>), while the v2 upgrade created <code>cache</code> alongside <code>records</code> with zero toasts on load/expand/query; fresh-profile run — login, table expansion, <code>SELECT * FROM records</code> mapped into the records section, and a mutation toast + <code>data:changed</code> reload — passed with no toasts.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 10:10:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Accordion data layout</code>: The data browser now renders each table's rows right inside its own accordion section — expanding a section shows the column types and, beneath them, the selected table's data as an HTML table under the <code>.schema-data</code> wrapper. Server-side builders (<code>data_browser/index.js</code> — <code>renderSchemaMarkup(schema, selectedTable, tableData)</code> + <code>renderDataMarkup</code>) and the client builders in <code>server/external/_/helpers/core.js</code> (<code>schemaItemMarkup</code>/<code>renderSchema</code>/<code>buildTableData</code>/<code>renderTableData</code>) were updated in sync; the dashboard SSR embeds the initial records table inside its section so the first paint shows data.</li>
          <li><code>Query results in the accordion</code>: There is no separate result panel — SQL query results share the accordion layout. The core runtime's <code>renderQueryResult</code>/<code>renderQueryError</code> map a results-kind statement to a table section when the returned columns exactly match that table's column set (<code>findQueryTable</code>, ambiguity → generic), and otherwise render a top <code>query result</code> pseudo-section (or <code>query failed</code> for errors) with the same section chrome; mutations keep their toast and refresh the schema via <code>data:changed</code>. Clicking a table header clears the active query view and loads that table's default snapshot. The bottom <code>#data-panel</code> and the <code>.pane-divider</code> were removed.</li>
          <li><code>data_browser styles</code>: <code>.schema-panel</code> became <code>flex: 1; min-height: 0</code> so the accordion fills the pane; added <code>.schema-data</code> (bordered, max-height 280px, scrollable, sticky table headers) plus <code>.query-result-section</code>/<code>.query-error-section</code>/<code>.query-error</code> accents; the reused CSS variables (<code>--c-head-bg</code>, <code>--c-row-hover</code>, <code>--c-border-light</code>, <code>--c-danger</code>) exist in the <code>container</code> base layout.</li>
          <li><code>README.md</code>: Updated the <code>Server-rendered pages</code> overview bullet and the <code>data_browser/</code> file-breakdown row for the embed-in-accordion layout and the no-separate-result-panel rule; recorded this change in the changelog.</li>
          <li><code>Verification</code>: All 7 embedded-script blocks compile (<code>bun build --target=browser</code>); HTTP smoke test over a fresh server — register + login, three SQL inserts into <code>records</code>, and <code>/dashboard</code> returns the authenticated SSR page containing <code>records · 3 total · showing 50</code> with the inserted rows (hello/world/sql training) rendered inside <code>&lt;div class="schema-data"&gt;</code> under the records section; guest <code>/dashboard</code> still redirects 302 → <code>/login</code>.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 09:32:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Seeding removed</code>: Startup now runs migrations only — no sample data is ever seeded. <code>seedSampleData()</code> was deleted from <code>server/internal/persistence/database.js</code> (with its <code>hashPassword</code> import), the <code>--seed</code> flag handling and the <code>await seedSampleData(database)</code> boot call were removed from <code>server/index.js</code>, and the <code>setup</code> script was removed from <code>package.json</code>; the boot banner's <code>Default login: admin / admin123</code> line was replaced with <code>First account: /register</code>. A fresh database starts empty and the first account is created through registration.</li>
          <li><code>Registration API</code>: Added <code>POST /api/authentication/register</code> (201, auto-sign-in). <code>server/internal/services/authentication.js</code> gained <code>register({ username, password })</code> — client-side rules enforced server-side (username 3-32 chars <code>[A-Za-z0-9_.-]</code>, password ≥ 8 chars), uniqueness checked before insert, SHA-256 hashed password stored via the new <code>users.insert()</code> repository method, and the account is signed in immediately (session token + <code>expiresAt</code> returned like <code>login</code>). The role is always <code>editor</code> — the client never supplies one.</li>
          <li><code>Register page</code>: Added the file-based <code>/register</code> route from <code>server/external/register/</code> — the <code>register_page</code> component renders a centered card (username, password, confirm) matching the login page, served in <code>container()</code> without the core runtime (<code>modules: false</code>); its self-contained script posts to <code>/api/authentication/register</code>, stores the bearer token in both localStorage and the <code>scheme_token</code> cookie, and redirects to <code>/dashboard</code>. Already-authenticated visitors are redirected to <code>/dashboard</code>. The login page now links first-time visitors to <code>/register</code> (replacing the now-false seeded-credentials hint) and its stale <code>Spreadsheet</code> subtitle was rebranded to <code>SQL Training Ground</code>.</li>
          <li><code>README.md</code>: Documented registration — Quick Start (register instead of seeded credentials), <code>Authentication flow</code> overview bullet, project-structure tree (<code>register/</code> route), architecture diagram, API reference (<code>/api/authentication/register</code> row), file-breakdown rows (<code>package.json</code>, <code>server/index.js</code>, <code>persistence/</code>, <code>register/</code> route, <code>authentication.js</code>), and this changelog entry.</li>
          <li><code>Verification</code>: Fresh-DB smoke test — empty <code>/api/records</code>, seeded-admin login fails (401), registration returns a working session (auto-login), duplicate/short/invalid registrations rejected (400), <code>/register</code> 200 with form + login link, authenticated <code>/register</code> → 302 to <code>/dashboard</code>, <code>/dashboard</code> + <code>/me</code> 200 with the new token, guest <code>/dashboard</code> → 302 to <code>/login</code>; all 7 embedded-script blocks compile (<code>bun build --target=browser</code>).</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 17:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Raw SQLite passthrough</code>: Removed the dialect translation layer — the sandbox no longer rewrites non-SQLite statements. <code>translateDialect()</code>, <code>quoteLiteral</code>, and every TRUNCATE/SHOW/DESCRIBE/DESC/USE/LIMIT/ON-DUPLICATE/MySQL-DDL rewrite were deleted from <code>server/internal/services/queries.js</code>; <code>execute()</code> passes the statement text to <code>database.query()</code> unchanged. Unsupported statements (<code>TRUNCATE TABLE records</code>, <code>SHOW TABLES</code>, <code>DESCRIBE records</code>, MySQL <code>ENGINE=</code>/<code>AUTO_INCREMENT</code> DDL, <code>ON DUPLICATE KEY UPDATE</code>, <code>DROP ... CASCADE</code>, <code>USE</code>) now fail exactly as SQLite reports them, so learners see the real engine error instead of a silently rewritten query.</li>
          <li><code>README.md</code>: Rewrote the <code>SQL sandbox</code> overview bullet, the <code>/api/queries</code> API row, and the queries-service file-breakdown row for raw passthrough; recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 16:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Unrestricted sandbox</code>: Removed the privacy model — there are no private or protected tables any more. Every table (including <code>_users</code>, <code>_sessions</code>, <code>_synchronization_log</code> and <code>sqlite_*</code> internals) is visible, browscable, and writable from the editor and the data browser. <code>server/internal/services/queries.js</code> dropped <code>isPrivateName</code>/<code>assertNotPrivate</code>/<code>extractIdentifiers</code> and the engine blocklist; <code>GET /api/data/_users</code> and <code>SELECT * FROM _users</code> now return 200/results instead of 403/forbidden.</li>
          <li><code>Dialect translation layer</code>: Added <code>translateDialect()</code> — a regex-based shim that rewrites common standard/MySQL statements to their SQLite equivalents before execution: <code>TRUNCATE TABLE</code> → <code>DELETE FROM</code>, <code>SHOW TABLES</code>/<code>SHOW DATABASES</code>/<code>SHOW CREATE TABLE</code>/<code>SHOW COLUMNS FROM</code>/<code>DESCRIBE</code>/<code>DESC</code> → <code>sqlite_schema</code>/<code>pragma_table_info</code> selects, <code>USE</code> → a no-op note, <code>LIMIT a, b</code> → <code>LIMIT b OFFSET a</code>, <code>ON DUPLICATE KEY UPDATE</code> → <code>ON CONFLICT DO UPDATE</code> (with <code>VALUES(col)</code> → <code>excluded.col</code>), and MySQL DDL attributes (<code>AUTO_INCREMENT</code>, <code>UNSIGNED</code>, <code>ZEROFILL</code>, <code>COMMENT</code>, <code>ENGINE=</code>, <code>DEFAULT CHARSET</code>, <code>COLLATE</code>, <code>UNIQUE KEY</code> → <code>UNIQUE</code>, <code>KEY</code>/<code>INDEX</code> constraints, <code>CURRENT_TIMESTAMP()</code>, <code>ON UPDATE CURRENT_TIMESTAMP</code>) are stripped inside <code>CREATE TABLE</code>; <code>DROP ... CASCADE</code>/<code>RESTRICT</code> trailing options are dropped.</li>
          <li><code>Engine statements allowed</code>: <code>PRAGMA</code> joined the row-returning keyword set (<code>PRAGMA table_info(...)</code> renders as results) with a <code>run()</code> fallback for write-pragmas; <code>VACUUM</code>/<code>ATTACH</code>/<code>DETACH</code>/<code>REINDEX</code> are allowed as mutations. Only multi-statement input is still rejected (<code>400</code>); unknown SQL surfaces the underlying error.</li>
          <li><code>Schema + data enrollment</code>: <code>listSchema()</code> returns <code>rowCount</code> per table (views carry <code>null</code>) and no <code>private</code> flag; <code>listTableData()</code> serves any table or view. Every mutation — including <code>TRUNCATE</code>/<code>DROP</code>/<code>VACUUM</code> — still publishes <code>data.changed</code> over SSE and appends a <code>_synchronization_log</code> audit entry.</li>
          <li><code>Accordion schema browser</code>: The <code>data_browser</code> right pane now renders the structure as an accordion — one collapsible section per table/view (caret + type/row-count badges + per-column name/type), clicking a header expands the section and loads its rows into the data panel. Server-side builders (<code>data_browser/index.js</code>) and the client builders in <code>external/_/helpers/core.js</code> were updated in sync; the <code>query_editor</code> highlights <code>*</code> and comparison operators, dropped private-table diagnostics, and the editor <code>KEYWORDS</code>/completions were broadened with MySQL, standard SQL, and pragma words.</li>
          <li><code>Verification</code>: Bundled, restarted, and ran the HTTP + SSE matrix — schema (row counts, no flags), <code>/api/data/_users</code> 200, <code>SELECT * FROM _users</code>, <code>TRUNCATE TABLE records</code> (Windows changes), <code>SHOW TABLES</code>/<code>SHOW DATABASES</code>/<code>SHOW CREATE TABLE</code>/<code>DESCRIBE</code>/<code>DESC</code>/<code>SHOW COLUMNS FROM</code>, MySQL-style <code>CREATE TABLE</code> with AUTO_INCREMENT/UNSIGNED/COMMENT/ENGINE/CHARSET/COLLATE/KEY/INDEX, <code>ON DUPLICATE KEY UPDATE</code> upsert, <code>LIMIT a, b</code>, <code>USE</code>, write + read <code>PRAGMA</code>, <code>VACUUM</code>, <code>DROP ... CASCADE</code>, multi-statement/error 400s, live SSE <code>data:changed</code> frames, sync audit rows, and 7/7 embedded-script syntax checks.</li>
          <li><code>README.md</code>: Documented the no-private sandbox, the dialect translation layer, the schema row-count enrollment, and the accordion browser — overview bullets (<code>SQL sandbox</code>, <code>Server-rendered pages</code>, <code>SQLite</code>), architecture diagram, API reference, file-breakdown rows, and this changelog entry.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 15:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>SQL training ground</code>: Replaced the spreadsheet shell with a SQL sandbox — the dashboard now renders a split-pane workspace whose left pane is a query editor (overlay-<code>&lt;pre&gt;</code> syntax highlighting, live diagnostics, completions, Ctrl+Enter run, Tab indentation, scroll sync) and whose right pane is a structure/data browser (the full schema with <code>_</code>-prefixed private tables grayed out and non-selectable, plus the selected table's rows).</li>
          <li><code>Queries microservice</code>: Added <code>server/internal/services/queries.js</code> — <code>listSchema()</code> (every table/view + columns + <code>private</code> flag), <code>listTableData(table, limit)</code> (public rows, max 500), and <code>execute(sql)</code> (single-statement execution). Query keywords (<code>SELECT</code>/<code>VALUES</code>/<code>WITH</code>/<code>EXPLAIN</code>) run through <code>statement.all()</code> and return <code>kind: "results"</code>; everything else mutates through <code>statement.run()</code> and returns <code>kind: "changes"</code> plus a <code>data.changed</code> domain event. Columns are derived from the first row's keys because this bun:sqlite build exposes no <code>Statement.columns</code> API.</li>
          <li><code>Privacy model</code>: Renamed the private tables to <code>_users</code>, <code>_sessions</code>, <code>_synchronization_log</code> (with the legacy <code>sync_log</code> migrate), and treated any <code>_</code>- or <code>sqlite_</code>-prefixed name as off-limits — grayed in the schema browser, <code>403</code> from SQL execution and <code>GET /api/data/:table</code>. Engine statements (<code>ATTACH</code>/<code>DETACH</code>, <code>PRAGMA</code>, <code>REINDEX</code>, <code>VACUUM</code>) are blocked and multi-statement input rejected with <code>400</code> (a statement scanner enforces this because <code>bun:sqlite</code> silently runs only the first statement of a string). Known sandbox limitations: <code>INSERT ... RETURNING</code> reports changes, <code>WITH</code> mutations report empty results without a reload signal, and <code>CREATE TRIGGER</code> bodies containing <code>;</code> are rejected.</li>
          <li><code>Wire protocol</code>: Added <code>GET /api/schema</code>, <code>GET /api/data/:table</code>, and <code>POST /api/queries</code> to the router adapters; the streaming service fans SQL mutations out as SSE <code>data:changed</code> (causing every open session to refetch the schema and visible table) and the synchronization service appends <code>operation: "sql"</code> audit entries for every executed statement.</li>
          <li><code>Frontend</code>: Rewrote the core runtime (<code>external/_/helpers/core.js</code>) around schema/table/query state with IndexedDB caching and SSE reloads; removed the toolbar and spreadsheet components; added <code>workspace</code>, <code>query_editor</code>, and <code>data_browser</code> components; pruned the shared button actions to <code>run-query</code> + <code>logout</code>; updated the topbar tagline, page title, and boot banner; removed the <code>--toolbar-h</code> CSS variable.</li>
          <li><code>Embedded-script escaping</code>: Doubled every backslash that must reach the emitted client code inside the ESM template literals (<code>\\n</code>, <code>\\t</code>… and the double-quote comparison via <code>'"'</code>) — all 7 injected component script blocks are now syntax-validated. A full HTTP + SSE verification matrix passed against a fresh database (login/dashboard/fallback shell, schema, table data, queries, DDL, privacy 403s, multi-statement 400, live <code>data:changed</code> frames, sync audit trail).</li>
          <li><code>README.md</code>: Documented the SQL training ground — overview bullets (<code>SQL sandbox</code>, updated component list, SSE reloads, private-section convention), project tree, architecture diagram, API reference (schema/data/queries), and file breakdown; recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 15:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Acknowledge rename</code>: Expanded the truncated <code>ack</code> to the full-word <code>acknowledge</code> per the naming convention (no truncation) — the synchronization endpoint became <code>POST /api/synchronization/acknowledge</code> and its response key became <code>acknowledged</code> (the service method was already <code>acknowledge</code>); <code>server/internal/router/adapters.js</code> and the README (overview bullet, API reference, file-breakdown row) were updated, and this rename was recorded in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 14:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Environment module</code>: Renamed <code>configuration/configuration.js</code> to <code>configuration/environment.js</code> — the env-derived <code>configuration</code> object now lives in a file named for its source (the environment), keeping a clear separation from the <code>configuration/</code> directory context; <code>@module</code> tag, project-root comment, importers (<code>server/index.js</code>, <code>middleware/cors.js</code>), the README project tree and file-breakdown row were updated, and this rename was recorded in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 14:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Configuration directory</code>: Grouped the centralized configuration into <code>server/internal/configuration/</code> and split it into dedicated purpose-named files — <code>join_path.js</code> (Bun-native <code>joinPath</code> helper) and <code>configuration.js</code> (the env-derived <code>configuration</code> object, with the project root now derived three levels up from <code>import.meta.dir</code>) — replacing <code>configuration.js</code>; importers (<code>server/index.js</code>, <code>middleware/cors.js</code>, <code>persistence/database.js</code>, <code>router/pages.js</code>) import each module from its own file.</li>
          <li><code>Router directory</code>: Grouped the routing layer into <code>server/internal/router/</code> and split it into dedicated purpose-named files — <code>engine.js</code> (<code>createRouterEngine</code> — per-method <code>:param</code> tables, exact page pathnames, <code>match()</code>), <code>adapters.js</code> (<code>registerApiAdapters</code> — every <code>/api/*</code> endpoint), <code>pages.js</code> (<code>registerPages</code> — file-based <code>server/external/</code> discovery), and <code>create_router.js</code> (async <code>createRouter({ services, pagesDirectory })</code> assembling engine + adapters + pages) — replacing <code>router.js</code>; <code>server/index.js</code> now imports <code>createRouter</code> from <code>router/create_router.js</code>.</li>
          <li><code>README.md</code>: Updated the project-structure tree, overview bullets (<code>Microservice architecture</code>, <code>Centralized configuration</code>), architecture diagram, file-breakdown rows (<code>configuration/</code>, <code>router/</code>), and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 13:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Security directory</code>: Grouped the security helpers into <code>server/internal/security/</code> and split them into dedicated purpose-named files — <code>hash_password.js</code> (SHA-256 <code>hashPassword</code>) and <code>generate_token.js</code> (random <code>generateToken</code>) — replacing <code>security.js</code>; importers (<code>server/index.js</code>, <code>persistence/database.js</code>) now import each helper from its own module.</li>
          <li><code>README.md</code>: Updated the project-structure tree and file-breakdown rows for the <code>security/</code> directory, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 13:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Internal restructure</code>: Reorganized <code>server/internal/</code> to drop every <code>index.js</code> and name each file for its specific purpose — directories only group files: <code>persistence/index.js</code> → <code>persistence/database.js</code>, <code>router/index.js</code> → <code>router.js</code> (single purpose-named file at the internal root), <code>shared/security.js</code> → <code>security.js</code> (nothing under <code>server/internal</code> is external, so the <code>shared/</code> grouping is redundant), and each service's <code>services/*/index.js</code> → <code>services/*.js</code>. All importers (<code>server/index.js</code>, <code>persistence/database.js</code>, <code>router.js</code>) were updated to the new paths; <code>@module</code> doc tags were refreshed.</li>
          <li><code>Offline-first reframing</code>: IndexedDB is now documented as a temporary cache only (the server remains the source of truth) and the <code>Offline-first synchronisation</code> overview bullet became <code>Synchronization log</code> — the microservice, its <code>synchronization_log</code> table, and the <code>/api/synchronization/*</code> endpoints are unchanged, but the app is no longer positioned as offline-first.</li>
          <li><code>README.md</code>: Updated the overview bullets (<code>Microservice architecture</code>, <code>IndexedDB</code>, <code>Synchronization log</code>), project-structure tree, architecture diagram, and file-breakdown rows for the flattened internal layout, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 12:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Router consolidation</code>: Merged the two routing modules into a single <code>server/internal/router/index.js</code> — <code>server/internal/routing/</code> (pattern-matching engine) and <code>server/internal/routes/</code> (HTTP adapters) were deleted. The consolidated module owns the whole routing graph: the per-method <code>:param</code> engine, every <code>/api/*</code> endpoint as a thin adapter into the microservices, and file-based <code>server/external/</code> page discovery (top-level dirs except <code>_</code>, Bun's native glob scanner + plain absolute-path <code>import()</code>). <code>createRouter({ services, pagesDirectory })</code> is now async and returns a fully-wired router: it registers every REST endpoint and loads every page at assembly time; <code>server/index.js</code> no longer calls <code>registerRoutes()</code> or <code>loadPages()</code>, only <code>await createRouter(...)</code> + <code>listPages()</code> for the boot banner.</li>
          <li><code>README.md</code>: Updated the project-structure tree (<code>routes/</code> + <code>routing/</code> → <code>router/</code>), the microservice overview bullet, the architecture diagram, and the file-breakdown rows for the consolidated router, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 12:00:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Login page</code>: Converted the sign-in modal into a full standalone page on its own route — the dashboard route (<code>server/external/dashboard/</code>) now redirects unauthenticated page requests to <code>/login</code> server-side, so guests never see the spreadsheet shell; the login route's component became <code>login_page</code> (replacing <code>login_modal</code>) rendered as a centered card on the app background (no dark modal overlay) and served without the core SPA runtime.</li>
          <li><code>core.js</code>: Replaced the <code>showLoginModal</code> modal API with <code>redirectToLogin()</code> — unauthorized responses and the guest bootstrap path now clear the session (localStorage + cookie) and navigate to <code>/login</code>; added <code>setSessionCookie</code>/<code>clearSessionCookie</code> helpers so the <code>scheme_token</code> token is mirrored into a cookie for server-rendered session recognition.</li>
          <li><code>login_page script</code>: Fully self-contained token post — the standalone <code>/login</code> page stores <code>scheme_token</code> in both localStorage and a cookie before redirecting to <code>/dashboard</code>, so the redirected browser reaches the dashboard already signed in.</li>
          <li><code>spreadsheet</code>: Removed the login-modal Escape handler from the component script.</li>
          <li><code>README.md</code>: Updated the overview, project structure, architecture diagram, and file breakdown for the <code>login_page</code> route-and-redirect model; added the <code>Authentication flow</code> overview bullet; recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 02:01:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Centralized configuration</code>: Added <code>server/internal/configuration.js</code> as the single module that reads <code>process.env</code> (Bun auto-loads <code>.env</code> at startup — the manual <code>node:fs</code> parser in <code>server/index.js</code> was deleted) and derives every project-rooted path from <code>import.meta.dir</code> with a Bun-native join helper (<code>joinPath</code>); the composition root and the CORS middleware now consume <code>configuration</code> instead of touching environment variables directly (<code>server/index.js</code>, <code>server/internal/middleware/cors.js</code>).</li>
          <li><code>Bun-native I/O</code>: Removed every <code>node:*</code> import from the server — <code>server/internal/routing/index.js</code> now discovers pages with <code>Bun.Glob</code> and imports them via plain absolute-path <code>import()</code> (no <code>node:fs</code>/<code>node:path</code>/<code>node:url</code>), and <code>server/internal/persistence/index.js</code> creates the storage directory with <code>Bun.write</code> (which creates parent directories implicitly) instead of <code>mkdirSync</code>; asset serving uses <code>joinPath</code> in the composition root.</li>
          <li><code>README.md</code>: Added the <code>Centralized configuration</code> Overview bullet, updated the project-structure tree, file-breakdown rows (<code>configuration.js</code>, <code>routing</code>, <code>persistence</code>, <code>server/index.js</code>), and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-17 00:37:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Application container</code>: Inlined the shared service registry into the composition root — <code>server/internal/application.js</code> was deleted and its <code>setApplication</code>/<code>getApplication</code> logic moved into <code>server/index.js</code>; SSR helpers and page handlers now import <code>getApplication</code> directly from <code>server/index.js</code> (<code>server/external/_/helpers/user.js</code>, <code>server/external/dashboard/index.js</code>), avoiding circular imports because pages are loaded via dynamic <code>import()</code> at boot after the application is registered.</li>
          <li><code>README.md</code>: Updated the Overview bullet, project-structure tree, and file breakdown for the relocated application container, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-16 10:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Structure</code>: Reorganized <code>server/internal/</code> into a microservice architecture — the flat modules (<code>authentication.js</code>, <code>database.js</code>, <code>event.js</code>, <code>handler.js</code>, <code>middleware.js</code>, <code>router.js</code>) were deleted and replaced by small domain services under <code>services/</code> (<code>authentication</code>, <code>records</code>, <code>synchronization</code>, <code>streaming</code>, <code>health</code>, <code>errors.js</code>, <code>event_bus</code>), plus <code>persistence/</code> (<code>index.js</code>, <code>migrations.js</code>, <code>repositories.js</code>), <code>middleware/</code> (factory-independent <code>context</code>/<code>pipeline</code>/<code>cors</code>/<code>body_parser</code>/<code>logger</code>/<code>error_boundary</code>/<code>authenticator</code>), <code>routes/index.js</code> (thin HTTP adapters), <code>routing/index.js</code> (unified REST + file-based page router), <code>application.js</code> (container), and <code>shared/security.js</code>.</li>
          <li><code>Event bus</code>: Added the in-process pub/sub bus (<code>services/event_bus</code>) with exact and <code>.*</code> wildcard patterns — the records service publishes domain events (<code>record.created/updated/deleted</code>, <code>row.created/deleted</code>) after each mutation; the synchronization service persists them to <code>synchronization_log</code> and the streaming service fans them out over SSE; services never import one another.</li>
          <li><code>server/index.js</code>: Rewritten as the composition root — env loading, persistence bootstrap + seeding, repository + event bus + microservice wiring, middleware pipeline (<code>errorBoundary → cors → body → logger → authenticator</code>), router registration, route registration, page loading, SSE keep-alive, and static/fallback shell serving.</li>
          <li><code>Naming</code>: Applied the full-word naming convention — <code>/api/auth/*</code> → <code>/api/authentication/*</code>, <code>/api/sync/*</code> → <code>/api/synchronization/*</code>, <code>scheme_token</code> cookie → <code>schemeToken</code>, bus events <code>scheme:synced</code> → <code>scheme:synchronized</code>, CSS <code>.btn*</code> → <code>.button*</code>, and identifiers (<code>context</code>, <code>eventSource</code>, <code>authenticationToken</code>, <code>updateLastSynchronization</code>, …); the <code>login-modal</code> component directory became <code>login_modal/</code>.</li>
          <li><code>server/external/</code>: Updated the core runtime (<code>_/helpers/core.js</code> — endpoint renames, <code>Number</code> IndexedDB vars, hydration shadowing fix), shared button component (<code>.button</code> family + <code>[data-action]</code>), dashboard components (<code>topbar</code>, <code>toolbar</code>, <code>statusbar</code>, <code>spreadsheet</code>), login page, and login modal (standalone post to <code>/api/authentication/login</code>) for the new endpoints and event names.</li>
          <li><code>.env</code>: Removed the stale <code>JWT_SECRET</code> variable and pointed <code>DB_PATH</code> at <code>./storage/scheme.db</code>; the old <code>data/</code> directory was removed.</li>
          <li><code>README.md</code>: Added the <code>Formatting rules</code> and <code>Naming convention</code> sections, updated the project structure, architecture diagram, API reference, and file breakdown for the microservice/event-driven model, and recorded this change in the changelog.</li>
          <li><code>Verification</code>: Seeding, an in-process smoke suite (30 assertions), a real-server verification suite over HTTP (13 assertions), and the full boot page/API matrix were exercised and passed against the new architecture.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-14 05:08:01 UTC+08:00</td>
      <td>
        <ul>
          <li><code>README.md</code>: Added the <code>## Overview</code> section with a project summary, a tree-like structure breakdown, the <code>Required Ignored</code> listing from the <code># Required</code> section of <code>.gitignore</code>, and a per-file breakdown.</li>
          <li><code>README.md</code>: Added the <code>## Changelog</code> section using the <code>TIMELINE</code> and <code>DETAILS</code> table format, recording the initial change entry in sequence order.</li>
          <li><code>Git</code>: Created the initial commit with the message <code>.</code> containing <code>.gitignore</code>, <code>LICENSE.txt</code>, <code>README.md</code>, <code>bun.lock</code>, <code>opencode.json</code>, and <code>package.json</code>.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-14 22:17:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>README.md</code>: Rebranded from <code># Template</code> to <code># Scheme</code>, documented the full-stack spreadsheet architecture, added the <code>Quick Start</code>, <code>Architecture</code>, and <code>API Reference</code> sections, and updated the <code>Project Structure</code>, <code>Required Ignored</code>, and <code>File Breakdown</code> tables.</li>
          <li><code>.env</code>: Added environment configuration for <code>PORT</code>, <code>HOST</code>, <code>DB_PATH</code>, <code>JWT_SECRET</code>, <code>SESSION_TTL</code>, and <code>CORS_ORIGIN</code>.</li>
          <li><code>.gitignore</code>: Added the <code>data/</code> runtime database directory to the <code># Required</code> section.</li>
          <li><code>package.json</code>: Added the <code>start</code>, <code>dev</code>, and <code>setup</code> scripts for running the application with bun.</li>
          <li><code>server.js</code>: Added the main Bun server entry point with environment loading, router registration, WebSocket upgrade handling for <code>/ws</code>, real-time broadcast middleware, static file serving, and SPA route handling.</li>
          <li><code>src/db.js</code>: Added the SQLite layer with schema migrations for <code>users</code>, <code>sessions</code>, <code>records</code>, and <code>sync_log</code>, WAL mode and foreign-key pragmas, sample-data seeding, and prepared-statement CRUD helpers.</li>
          <li><code>src/auth.js</code>: Added SHA-256 password hashing, cryptographically random token generation, and bearer-token validation against live sessions.</li>
          <li><code>src/middleware.js</code>: Added the composable middleware pipeline with request context helpers, CORS, JSON body parsing, request logging, an error-boundary middleware, and the auth middleware.</li>
          <li><code>src/router.js</code>: Added a lightweight pattern-matching URL router supporting <code>:param</code> capture for <code>GET</code>, <code>POST</code>, <code>PUT</code>, <code>PATCH</code>, and <code>DELETE</code>.</li>
          <li><code>src/api.js</code>: Added RESTful handlers for login/logout/me, records CRUD, row add/delete, and sync pending/ack endpoints.</li>
          <li><code>src/views.js</code>: Added server-side HTML rendering for the application shell and login page with XSS-escaping helpers.</li>
          <li><code>public/app.css</code>: Added the spreadsheet stylesheet covering the top bar, toolbar, sticky header grid, row selection, cell editor overlay, login modal, toasts, and responsive layout.</li>
          <li><code>public/app.js</code>: Added the client-side application handling login/logout, REST fetching, IndexedDB offline caching, WebSocket reconnection with live updates, inline cell editing, row operations, search filtering, and toast notifications.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 11:30:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>src/sse.js</code>: Replaced the WebSocket broadcaster with a Server-Sent Events module — a client registry over <code>ReadableStream</code>, a named-event <code>broadcastSSE()</code> push helper, an idle keep-alive heartbeat, and the <code>GET /api/events</code> route handler wrapped in the server's middleware pipeline.</li>
          <li><code>server.js</code>: Removed the WebSocket upgrade handler, client set, and <code>wsServer</code> config; wired the router to <code>handleSSE</code> at <code>/api/events</code>; pointed the broadcast middleware at <code>broadcastSSE()</code>; disabled Bun's default 10s <code>idleTimeout</code> (set to <code>0</code>) so idle event streams are never dropped; started the 15s keep-alive heartbeat at boot; and updated the docs banner to advertise SSE.</li>
          <li><code>public/app.js</code>: Replaced the <code>WebSocket</code> client (manual reconnect timers) with the browser-native <code>EventSource</code>, which reconnects automatically; subscribed to the named <code>record:*</code> and <code>row:*</code> events and re-rendered the spreadsheet DOM in place.</li>
          <li><code>src/middleware.js</code>: Removed the unused <code>ws</code> field from the request context.</li>
          <li><code>README.md</code>: Documented the SSE architecture, added <code>GET /api/events</code> to the API reference, added <code>src/sse.js</code> to the File Breakdown table, and recorded this migration in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 12:10:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Structure</code>: Restructured the repository — <code>public/</code> became <code>client/</code> (<code>app.css</code> → <code>index.css</code>, <code>app.js</code> → <code>index.js</code>), <code>src/</code> became <code>server/</code> (<code>api.js</code> → <code>handler.js</code>, <code>auth.js</code> → <code>authentication.js</code>, <code>db.js</code> → <code>database.js</code>, <code>sse.js</code> → <code>events.js</code>, <code>server.js</code> → <code>server/index.js</code>), and the runtime database moved from <code>data/</code> to <code>storage/</code>.</li>
          <li><code>client/index.html</code>: Added the static SPA shell — the app shell previously server-rendered by <code>src/views.js</code> was inlined into a static HTML file with the favicon and stylesheet links.</li>
          <li><code>assets/favicon.svg</code>: Added an SVG browser favicon for the spreadsheet app.</li>
          <li><code>server/index.js</code>: Rewrote static serving — the <code>client/</code> directory is served from disk as a single page app (<code>/</code> → <code>index.html</code>, <code>/index.css</code>, <code>/index.js</code>, <code>/assets/*</code>) with an SPA fallback for unknown navigation routes plus a path-traversal guard; <code>/login</code> still renders the standalone login page from <code>server/views.js</code>.</li>
          <li><code>server/views.js</code>: Removed the server-rendered app shell (moved to the static SPA) and kept the standalone login page and XSS-escaping helper.</li>
          <li><code>package.json</code>, <code>.env</code>, <code>.gitignore</code>: Pointed scripts/runtime at <code>server/index.js</code>, set <code>DB_PATH=storage/scheme.db</code>, and ignored <code>storage/</code> instead of <code>data/</code>.</li>
          <li><code>README.md</code>: Updated the project structure, required-ignored table, architecture diagram, file breakdown, and quick-start commands for the new layout, and recorded this restructure in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 12:41:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>server/pages/router.js</code>: Added the file-based page router — a recursive scan of <code>server/pages/</code> discovers every directory containing <code>index.js</code>, maps it to a URL pathname (the conventional <code>root/</code> directory owns <code>/</code>), dynamically imports the page handler via <code>pathToFileURL</code> at boot, and logs the loaded routes.</li>
          <li><code>server/pages/shared/</code>: Added shared SSR helpers — <code>esc.js</code> (XSS escaping), <code>html.js</code> (<code>pageLayout()</code> composing the document head, the <code>type="module"</code> client script tag, and body shell with optional <code>bodyClass</code>), and <code>user.js</code> (<code>getRequestUser()</code> resolving the current user from the bearer header or <code>scheme_token</code> cookie for auth-state pre-rendering).</li>
          <li><code>server/pages/root/</code>: Added the root page (<code>/</code>) — fully server-renders the spreadsheet shell before any client JS runs: pre-rendered rows from <code>getAllRecords()</code>, authenticated user state (top bar with user name/role or login modal), toolbar, status bar, and toast container; each section lives in a small component under <code>views/</code> (<code>topbar</code>, <code>toolbar</code>, <code>spreadsheet</code>, <code>login-modal</code>, <code>statusbar</code>, <code>toasts</code>, plus the example <code>button</code>).</li>
          <li><code>server/pages/login/</code>: Added the login page (<code>/login</code>) — a standalone server-rendered sign-in card whose inline module script posts credentials to <code>/api/auth/login</code>, stores <code>scheme_token</code>, and redirects to <code>/</code>.</li>
          <li><code>server/index.js</code>: Routed the page router at boot before <code>Bun.serve</code>, matched server-rendered pages ahead of API/static handling, removed the legacy <code>/login</code> special case and the <code>server/views.js</code> import, and updated the boot banner to list discovered pages.</li>
          <li><code>client/index.html</code>: Repositioned the client module into the document <code>&lt;head&gt;</code> as <code>&lt;script type="module" src="/index.js"&gt;</code> and marked the file as the SPA fallback shell for unknown client-side routes (the canonical <code>/</code> page is now server-rendered).</li>
          <li><code>server/views.js</code>: Deleted — migrated into the file-based <code>server/pages/</code> structure; the standalone login page is now <code>server/pages/login/</code> and the escaping helper is <code>server/pages/shared/esc.js</code>.</li>
          <li><code>README.md</code>: Documented the server-rendered pages architecture in the overview, project-structure tree, architecture diagram, and file breakdown, and recorded this migration in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 13:11:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>client/index.html</code>: Moved the module script into the document <code>&lt;head&gt;</code> as <code>&lt;script type="module" src="/index.js"&gt;</code> and emptied the <code>&lt;body&gt;</code> — the file is now the SPA fallback frame only. All page markup (top bar, toolbar, spreadsheet, status bar, login modal, toasts) lives exclusively in the views under <code>server/pages/</code>.</li>
          <li><code>client/index.js</code>: Added shell hydration — when the empty fallback shell is loaded (asset request or client-side route), <code>hydrateShell()</code> fetches the server-rendered <code>/</code> page (propagating the bearer token) and swaps its body in place before binding events, so <code>server/pages/</code> remains the single source of page DOM.</li>
          <li><code>README.md</code>: Updated the overview, architecture diagram, and file breakdown to describe the empty fallback shell and SSR hydration flow, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 13:41:00 UTC+08:00</td>
      <td>
        <ul>
          <li><code>server/pages/shared/html.js</code>: Switched to fully embedded client assets — <code>index.css</code> and <code>index.js</code> are read once at module load and inlined into every page as <code>&lt;style&gt;</code> and <code>&lt;script type="module"&gt;</code> blocks, replacing the external <code>&lt;link rel="stylesheet"&gt;</code>/<code>&lt;script src&gt;</code> references.</li>
          <li><code>server/index.js</code>: Replaced static SPA-shell serving with a generated empty-body shell — <code>renderShell()</code> builds the fallback page from <code>pageLayout()</code> (embedded style/script, empty <code>&lt;body&gt;</code>) per GET request; raw <code>/index.css</code>, <code>/index.js</code>, and <code>/assets/*</code> remain served for dev/debug access only (no page references them).</li>
          <li><code>client/index.html</code>: Deleted — the empty shell is now generated server-side by <code>server/index.js</code>; the page HTML is served once and subsequent updates are injected into the <code>&lt;body&gt;</code> by the client module (SSR hydration + SSE DOM manipulation).</li>
          <li><code>README.md</code>: Documented the embedded-assets model (no external stylesheet/script requests), updated the architecture diagram and file breakdown, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 14:15:31 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Structure</code>: Removed the static <code>client/</code> directory — <code>client/index.css</code> migrated into separated CSS string constants in <code>server/pages/shared/styles.js</code> (<code>resetCss</code>, <code>varsCss</code>, <code>baseCss</code>, <code>buttonCss</code>, <code>separatorCss</code>, <code>responsiveCss</code>, the joined <code>globalCss</code>, and per-component <code>topbarCss</code>, <code>toolbarCss</code>, <code>spreadsheetCss</code>, <code>statusbarCss</code>, <code>modalCss</code>, <code>formCss</code>, <code>toastCss</code>, <code>loginCardCss</code>), and the client module moved to <code>server/client.js</code>.</li>
          <li><code>server/pages/shared/html.js</code>: Now embeds the global stylesheet (<code>globalCss</code>) in the shared <code>&lt;style&gt;</code> element and reads the client module from <code>server/client.js</code> at boot.</li>
          <li><code>Views</code>: Each custom view component (<code>server/pages/*/views/*.js</code>) now imports its component CSS from <code>server/pages/shared/styles.js</code> and embeds its own <code>&lt;style&gt;</code> element when rendered, so a component carries exactly the styles it needs.</li>
          <li><code>server/router.js</code>: Merged into a single unified router — folded <code>server/pages/router.js</code> (file-based page discovery: <code>scanPages</code>, <code>pathnameForSegments</code>, <code>PAGE_FILENAME=index.js</code>, plus <code>page</code>/<code>loadPages</code>/<code>listPages</code>) into the REST pattern router; <code>match(method, pathname)</code> now returns <code>{ type: "page" | "api", handler, params }</code>, dispatching server-rendered pages first (exact pathname, method-agnostic) then per-method API patterns.</li>
          <li><code>server/pages/router.js</code>: Deleted — page routing now lives in <code>server/router.js</code>.</li>
          <li><code>server/index.js</code>: Removed the separate page router and the raw <code>/index.css</code>/<code>/index.js</code> static serving — pages load via <code>router.loadPages(resolve(import.meta.dir, "pages"))</code> at boot and dispatch through the unified <code>router.match()</code>; the boot banner no longer lists a static directory.</li>
          <li><code>README.md</code>: Updated the project structure, architecture diagram, and file breakdown for the unified router and the static-free embedded-assets model, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 14:57:35 UTC+08:00</td>
      <td>
        <ul>
          <li><code>server/pages/shared/scripts.js</code>: Added the separated embedded client script strings — <code>coreScript</code> (the generic runtime: state, event bus, IndexedDB cache, REST plumbing, spreadsheet rendering, auth, SSE, toasts, shell hydration) embedded once in <code>&lt;head&gt;</code> by the shared shell and exposing <code>window.SchemeApp</code>; plus component strings (<code>topbarScript</code>, <code>toolbarScript</code>, <code>spreadsheetScript</code>, <code>statusbarScript</code>, <code>loginModalScript</code>, <code>loginCardScript</code>) embedded by each view component. The embedded scripts avoid backticks/<code>${</code> (string concatenation instead) and are guarded by <code>SchemeApp.bound</code>.</li>
          <li><code>server/client.js</code>: Deleted — the monolithic client module was replaced by the generic core script plus component-specific <code>&lt;script type="module"&gt;</code> blocks; <code>server/pages/shared/html.js</code> no longer reads it at boot.</li>
          <li><code>Views</code>: Each custom view component (<code>server/pages/*/views/*.js</code>) now embeds its own <code>&lt;script type="module"&gt;</code> block alongside its <code>&lt;style&gt;</code> block — <code>topbar</code> (logout + user-card updates via the <code>scheme:user</code> bus event), <code>toolbar</code> (add/delete/refresh buttons + search), <code>spreadsheet</code> (click/dblclick delegation, inline cell editor keyboard, outside-click deselection, escape-to-close), <code>statusbar</code> (<code>scheme:synced</code> last-sync readout), <code>login-modal</code> (sign-in form submit), and <code>login-card</code> (self-contained login form, replacing its old inline script).</li>
          <li><code>server/pages/shared/html.js</code>: Rewritten to embed <code>coreScript</code> from <code>shared/scripts.js</code> in the <code>&lt;head&gt;</code> <code>&lt;script type="module"&gt;</code> block when <code>modules=true</code>; dropped the boot-time <code>readFileSync</code> of <code>server/client.js</code>.</li>
          <li><code>server/pages/shared/scripts.js</code> <code>hydrateShell()</code>: Re-instantiates the injected component module scripts after the fallback shell's body is swapped in — <code>innerHTML</code> does not execute <code>&lt;script&gt;</code> elements, so each inline module script is cloned and replaced in place to attach its behaviour.</li>
          <li><code>server/pages/root/index.js</code>, <code>server/index.js</code>: Updated stale doc comments that referenced <code>server/client.js</code> to describe the embedded core + component script model.</li>
          <li><code>README.md</code>: Updated the overview, project structure tree, architecture diagram, and file breakdown for the script-string architecture, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 16:46:55 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Structure</code>: Split <code>server/</code> into an external surface and internal plumbing — the backend machinery (<code>authentication.js</code>, <code>database.js</code>, <code>handler.js</code>, <code>middleware.js</code>, <code>router.js</code>) moved into <code>server/internal/</code> (<code>events.js</code> renamed <code>event.js</code>), while everything the browser touches lives under <code>server/external/</code>: <code>components/</code> (per-component directories), <code>helpers/</code> (shared server-side utilities), and <code>pages/</code> (file-based SSR routes).</li>
          <li><code>Components</code>: Replaced the shared <code>server/pages/shared/scripts.js</code> + <code>styles.js</code> with per-component directories — each component under <code>server/external/components/&lt;name&gt;/</code> owns its local <code>index.js</code>, <code>styles.js</code>, and <code>scripts.js</code> and embeds its own <code>&lt;style&gt;</code>/<code>&lt;script type="module"&gt;</code> blocks: <code>container</code> (base layout — reset, CSS variables, typography, responsive), <code>button</code>, <code>topbar</code>, <code>toolbar</code>, <code>spreadsheet</code>, <code>statusbar</code>, <code>toasts</code> (styles only), <code>login-modal</code>, and <code>login-card</code>.</li>
          <li><code>server/external/helpers/core.js</code>: De-consolidated from the old <code>shared/scripts.js</code> — now exports only <code>coreScript</code> (the generic <code>window.SchemeApp</code> runtime still embedded once in <code>&lt;head&gt;</code> by <code>html.js</code>); the six component script strings moved into their components' local <code>scripts.js</code> files.</li>
          <li><code>server/external/helpers/escape.js</code>: Renamed from <code>shared/esc.js</code> and exported as <code>escapeHtml()</code>; all component imports updated.</li>
          <li><code>server/external/helpers/html.js</code>: <code>pageLayout()</code> no longer embeds a global <code>&lt;style&gt;</code> in <code>&lt;head&gt;</code> — the base stylesheet now ships with the <code>container</code> component when pages wrap their bodies in <code>container()</code>.</li>
          <li><code>server/external/components/button/</code>: New reusable element — owns its <code>.btn</code> styles plus a generic <code>[data-action]</code> click-delegation script; toolbar (<code>add-row</code>, <code>delete-row</code>, <code>refresh</code>) and topbar (<code>logout</code>) buttons now render via this component carrying only <code>data-action</code> attributes, and their own scripts trim down to search-wiring (toolbar) and user-card bus mirroring (topbar).</li>
          <li><code>server/external/pages/</code>: <code>root/index.js</code> and <code>login/index.js</code> rewritten — each page composes its component markup inside <code>container()</code>; the page loader in <code>server/internal/router.js</code> now scans <code>server/external/pages</code>.</li>
          <li><code>server/pages/</code>: Deleted — the old shared modules, page handlers, and view files were fully absorbed into <code>server/external/components/</code>, <code>server/external/helpers/</code>, and <code>server/external/pages/</code>.</li>
          <li><code>server/index.js</code>: Import paths updated (<code>./internal/*</code>, <code>./external/helpers/html.js</code>), page discovery points at <code>resolve(import.meta.dir, "external", "pages")</code>, and doc comments describe the external/internal split.</li>
          <li><code>README.md</code>: Updated the overview, project structure tree, architecture diagram, and file breakdown for the external/internal hierarchy and the per-component local assets model, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>2026-09-15 17:55:58 UTC+08:00</td>
      <td>
        <ul>
          <li><code>Structure</code>: Reorganized <code>server/external/</code> into route-scoped page routes — the shared directory became <code>server/external/_/</code> (<code>components/</code> holds the <code>container</code> layout and the reusable <code>button</code> element; <code>helpers/</code> holds <code>core.js</code>, <code>escape.js</code>, <code>html.js</code>, <code>user.js</code>), the old <code>pages/root/</code> became <code>server/external/dashboard/</code> (the new main page at <code>/dashboard</code>, owning <code>topbar</code>, <code>toolbar</code>, <code>spreadsheet</code>, <code>statusbar</code>, <code>toasts</code>), and <code>pages/login/</code> became <code>server/external/login/</code> (owning <code>login-modal</code>). The old <code>server/external/components/</code> and <code>server/external/pages/</code> directories were deleted and the <code>login-card</code> component was absorbed into <code>login-modal</code>.</li>
          <li><code>server/internal/router.js</code>: Rewrote page discovery as a flat scan of top-level <code>server/external/</code> directories — every directory (except the shared <code>_</code>) containing an <code>index.js</code> becomes an exact <code>/&lt;dir&gt;</code> route (<code>dashboard</code> → <code>/dashboard</code>, <code>login</code> → <code>/login</code>); removed the recursive walk and the <code>root</code>-owns-<code>/</code> special case.</li>
          <li><code>server/index.js</code>: <code>loadPages</code> now scans <code>resolve(import.meta.dir, "external")</code>; a bare <code>/</code> request returns a <code>302</code> redirect to <code>/dashboard</code>; doc comments updated for the route-scoped layout.</li>
          <li><code>server/external/login/components/login-modal/scripts.js</code>: Made the component context-aware (hybrid) — on the dashboard it delegates to the core runtime (<code>SchemeApp.login</code> + <code>loadData</code> + <code>connectEventSource</code>), while on the standalone <code>/login</code> page (no core runtime hosted) it posts directly to <code>/api/auth/login</code>, stores <code>scheme_token</code>, and redirects to <code>/dashboard</code>.</li>
          <li><code>server/external/dashboard/index.js</code>: Rewritten as the dashboard page handler — composes <code>container()</code> with the route's <code>topbar</code>/<code>toolbar</code>/<code>spreadsheet</code>/<code>statusbar</code>/<code>toasts</code> plus the login route's <code>login-modal</code> (pre-rendered visible for guests, hidden for authenticated users).</li>
          <li><code>server/external/login/index.js</code>: Rewritten — standalone sign-in page rendering the login-modal in <code>container()</code> without the core runtime (<code>modules: false</code>).</li>
          <li><code>server/external/_/helpers/core.js</code>: <code>hydrateShell()</code> now fetches the server-rendered dashboard page (<code>fetch("/dashboard")</code>) instead of <code>/</code>, and its doc comment names <code>server/external/dashboard/</code> as the page-DOM source.</li>
          <li><code>Server</code>: Import paths updated across all moved components (<code>escapeHtml</code> and the shared <code>button</code> now resolve through <code>../../../_/helpers/</code> / <code>../../../_/components/</code> from dashboard/login components; shared helpers resolve internal modules via <code>../../../internal/</code>).</li>
          <li><code>README.md</code>: Updated the overview, project structure tree, architecture diagram, and file breakdown for the route-scoped component model with the <code>_/</code> shared directory, and recorded this change in the changelog.</li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>
