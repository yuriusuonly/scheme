/**
 * @module internal/services/queries
 * Queries microservice — the SQL training-ground engine.
 *
 * This service is the front door to the database for the training UI:
 *   - `listSchema()`       → every user table/view, its columns, and row counts
 *                            (SQLite's built-in `sqlite_*` tables are hidden)
 *   - `listTableData()`    → rows for one table
 *   - `execute()`          → run an arbitrary single SQL statement and return
 *                            columns+rows for queries or changes for mutations
 *
 * There are no private or protected tables. SQLite's built-in internal tables
 * (`sqlite_schema`, `sqlite_master`, `sqlite_sequence`, `sqlite_stat1`, ...)
 * are simply omitted from the schema enrollment — the file-browser tree, the
 * editor completions, and the query-tab matcher are all built from that
 * listing — but they stay reachable by name from the raw SQL sandbox. SQL is
 * executed exactly as written against SQLite; unsupported statements fail with
 * the underlying engine error so learners see the cause directly.
 *
 * Everything runs as a single statement: `bun:sqlite` quietly compiles and
 * executes only the first statement it is given, so the SQL text is scanned
 * first and any top-level `;` followed by more content rejects the request.
 * Queries are classified by their first keyword — `SELECT`, `VALUES`, `WITH`,
 * `EXPLAIN` and `PRAGMA` are executed through `statement.all()` (columns are
 * derived from the first row's keys), everything else mutates through
 * `statement.run()`. Mutations publish a `data.changed` domain event carrying
 * the full statement text, execution facts, a best-effort mutation scope
 * (`affectedTables` / `schemaChanged` / `allTables` — see `statementScope`),
 * and any audit metadata the caller forwarded, so the streaming service can
 * push a sanitized SSE `data:changed` wire event to every connected client
 * and the synchronization service can append an audit entry. Clients use the
 * scope to refresh only the open tabs the mutation actually touched.
 *
 * Every mutation is also mirrored onto the single always-on snapshot database
 * (see `persistence/database.js`): the identical SQL runs on the snapshot
 * connection FIRST and only then on the live database, so a failing backup
 * write aborts before the live state is touched. The snapshot schema is
 * seeded from the live database at boot and both connections run the same
 * migrations, so sandbox DDL stays in step; reads and classification target
 * the live database, and application-internal writes (registration, sessions,
 * audit rows) are intentionally not mirrored. Restoring is a manual file copy
 * of the snapshot over the live database (with the server stopped).
 *
 * Known sandbox limitations: `INSERT ... RETURNING` reports changes instead
 * of the returned rows, `WITH ... INSERT`/`DELETE`/`UPDATE` is treated as a
 * query (the mutation reports an empty result set and does not emit
 * `data.changed`), and `CREATE TRIGGER` bodies containing `;` are rejected as
 * multiple statements.
 */

import { badRequest, notFound } from "./errors.js";

/**
 * Query keywords — statements whose result is a set of rows. Everything else
 * (INSERT, UPDATE, DELETE, REPLACE, CREATE, DROP, ALTER, VACUUM, …) mutates
 * and is executed through `statement.run()`. `PRAGMA` is here so inspector
 * pragmas (`PRAGMA table_info(...)`, `PRAGMA index_list(...)`, …) render as
 * results; assignment write-pragmas (`PRAGMA foreign_keys = ON`) are detected
 * in `execute()` and run as mutations instead.
 */
const queryFirstKeywords = new Set(["SELECT", "VALUES", "WITH", "EXPLAIN", "PRAGMA"]);

/**
 * Quote an identifier safely for interpolation into a SQL string.
 * @param {string} name
 * @returns {string}
 */
function quoteIdentifier(name) {
  return `"${name.split('"').join('""')}"`;
}

/**
 * Extract the leading keyword of a statement, skipping any leading comments
 * and whitespace. Returns the uppercased word, or "" when none is present.
 * @param {string} sql
 * @returns {string}
 */
function firstKeywordOf(sql) {
  const withoutLeadingComments = sql.replace(/^\s*(--[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*/, "");
  const keyword = (withoutLeadingComments.match(/^[A-Za-z]+/) || [""])[0];
  return keyword.toUpperCase();
}

/**
 * Reject any multi-statement input. `bun:sqlite` executes only the first
 * statement of a string, which would silently discard the rest — dangerous
 * in a training sandbox. The scanner skips string literals, quoted
 * identifiers, and both comment styles, so a `;` that appears after the
 * statement has more than whitespace/comments remaining is rejected.
 * Semicolons inside quoted text ("a;b") do not count.
 * @param {string} sql
 */
function assertSingleStatement(sql) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;
  let afterSemicolon = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inSingleQuote) {
      if (char === "'") {
        if (next === "'") index += 1;
        else inSingleQuote = false;
      }
      continue;
    }
    if (inDoubleQuote) {
      if (char === "\"") {
        if (next === "\"") index += 1;
        else inDoubleQuote = false;
      }
      continue;
    }
    if (inBacktick) {
      if (char === "`") inBacktick = false;
      continue;
    }
    if (inBracket) {
      if (char === "]") inBracket = false;
      continue;
    }

    if (char === "'") inSingleQuote = true;
    else if (char === "\"") inDoubleQuote = true;
    else if (char === "`") inBacktick = true;
    else if (char === "[") inBracket = true;
    else if (char === "-" && next === "-") {
      inLineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
    } else if (char === ";") {
      afterSemicolon = true;
    } else if (afterSemicolon && !/[\s]/.test(char)) {
      throw badRequest("Only a single SQL statement is allowed in the training sandbox");
    }
  }
}

/**
 * Replace string literals and comments with spaces so a statement's structure
 * can be scanned without its content misleading the scope parser. Quoted
 * identifiers (`"t"`, `` `t` ``, `[t]`) are deliberately preserved — a table
 * name written in quotes is still a table name and must be readable. Both
 * `--` line comments and `/* ... *​/` block comments are removed; doubled
 * single quotes (`it''s`) are a SQLite string-literal escape and consumed.
 * @param {string} sql
 * @returns {string}
 */
function scopeCleanSql(sql) {
  let output = "";
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (inSingleQuote) {
      if (char === "'") {
        if (next === "'") {
          index += 1;
        } else {
          inSingleQuote = false;
        }
      }
      output += " ";
      continue;
    }
    if (inLineComment) {
      output += char === "\n" ? "\n" : " ";
      if (char === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
        output += "  ";
      } else {
        output += " ";
      }
      continue;
    }
    if (char === "'") {
      inSingleQuote = true;
      output += " ";
      continue;
    }
    if (char === "-" && next === "-") {
      inLineComment = true;
      index += 1;
      output += "  ";
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      output += "  ";
      continue;
    }
    output += char;
  }
  return output;
}

/**
 * Read one identifier (bare or quoted) starting at `from`, returning the
 * unquoted name and the index just past it, or null when no identifier begins
 * there. Bare identifiers match SQLite's `[A-Za-z_$][A-Za-z0-9_$]*`; quoted
 * identifiers accept `"…"`, `` `…` `` and `[…]` with doubled quotes inside.
 * @param {string} text
 * @param {number} from
 * @returns {{ name: string, index: number } | null}
 */
function readIdentifier(text, from) {
  let index = from;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (index >= text.length) return null;
  const char = text[index];
  let name = "";
  if (char === '"' || char === "`" || char === "[") {
    const closing = char === "[" ? "]" : char;
    index += 1;
    while (index < text.length) {
      if (text[index] === closing) {
        if (closing === '"' && text[index + 1] === '"') {
          name += '"';
          index += 2;
          continue;
        }
        index += 1;
        break;
      }
      name += text[index];
      index += 1;
    }
    return { name, index };
  }
  const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(index));
  if (!match) return null;
  return { name: match[0], index: index + match[0].length };
}

/**
 * Read a table name from a statement, resolving schema-qualified references
 * (`UPDATE main.users …` → `users`) by taking the last identifier segment.
 * @param {string} text
 * @param {number} from
 * @returns {{ name: string, index: number } | null}
 */
function readTableIdentifier(text, from) {
  const first = readIdentifier(text, from);
  if (!first) return null;
  let peek = first.index;
  while (peek < text.length && /\s/.test(text[peek])) peek += 1;
  if (text[peek] === ".") {
    const second = readIdentifier(text, peek + 1);
    if (second) return second;
  }
  return first;
}

/**
 * Derive a best-effort invalidation scope for one SQL mutation.
 *
 * The scope tells connected clients which open tables a mutation actually
 * changed, so they refresh only those tabs instead of re-reading everything:
 *
 *   - INSERT / REPLACE / UPDATE / DELETE → the one table they write to
 *   - CREATE / DROP / ALTER               → schema changed (structure re-read,
 *     the TABLE/VIEW name is included when it is readable)
 *   - VACUUM / REINDEX / ATTACH / DETACH   → schema/visibility may change but
 *     no table data changed (empty scope — the client still re-reads the
 *     schema, which remains cheap and correct)
 *   - anything else (write-PRAGMA, unknown) → empty scope (no tab refresh)
 *
 * Scope parsing is deliberately conservative: it never throws, and anything it
 * cannot confidently resolve widens to an empty scope. TRIGGERs are handled
 * by the caller — a named table carrying triggers widens `allTables`.
 *
 * @param {string} sql  the raw statement; cleaned internally
 * @returns {{ affectedTables: Array<string>, schemaChanged: boolean, allTables: boolean }}
 */
function statementScope(sql) {
  const clean = scopeCleanSql(sql).trim();
  const keyword = firstKeywordOf(clean);
  const scope = { affectedTables: [], schemaChanged: false, allTables: false };

  if (keyword === "INSERT" || keyword === "REPLACE") {
    // INSERT [OR conflict] INTO table / REPLACE INTO table
    let index = keyword.length;
    const orMatch = /^\s+OR\s+[A-Za-z]+/.exec(clean.slice(index));
    if (orMatch) index += orMatch[0].length;
    const intoMatch = /\s+INTO\s+/i.exec(clean.slice(index));
    if (!intoMatch) return scope;
    const table = readTableIdentifier(clean, index + intoMatch[0].length);
    if (table) scope.affectedTables.push(table.name);
    return scope;
  }

  if (keyword === "UPDATE") {
    // UPDATE [OR conflict] table SET …
    let index = keyword.length;
    const orMatch = /^\s+OR\s+[A-Za-z]+/.exec(clean.slice(index));
    if (orMatch) index += orMatch[0].length;
    const table = readTableIdentifier(clean, index);
    if (table) scope.affectedTables.push(table.name);
    return scope;
  }

  if (keyword === "DELETE") {
    // DELETE FROM table
    const fromMatch = /\s+FROM\s+/i.exec(clean.slice(keyword.length));
    if (!fromMatch) return scope;
    const table = readTableIdentifier(clean, keyword.length + fromMatch[0].length);
    if (table) scope.affectedTables.push(table.name);
    return scope;
  }

  if (keyword === "CREATE" || keyword === "DROP" || keyword === "ALTER") {
    // DDL always changes the schema. The TABLE/VIEW name is captured when the
    // object is named (CREATE TABLE t / DROP TABLE t / ALTER TABLE t …);
    // CREATE INDEX … ON t and CREATE TRIGGER … ON t deliberately leave the
    // affectedTables list empty because the indexed/fired table's data itself
    // does not change.
    scope.schemaChanged = true;
    const objectMatch = /\s+(TABLE|VIEW)\s+/i.exec(clean.slice(keyword.length));
    if (objectMatch) {
      let after = keyword.length + objectMatch[0].length;
      // The TABLE/VIEW match already consumed the space after it, so the
      // optional IF may sit flush against it ("TABLE IF EXISTS t").
      const ifMatch = /\s*IF\s+(NOT\s+)?EXISTS\s+/i.exec(clean.slice(after));
      if (ifMatch) after += ifMatch[0].length;
      const table = readTableIdentifier(clean, after);
      if (table) scope.affectedTables.push(table.name);
    }
    return scope;
  }

  return scope;
}

/**
 * Create the queries service.
 * @param {object} dependencies
 * @param {import("bun:sqlite").Database} dependencies.database          raw live SQLite handle
 * @param {import("bun:sqlite").Database} dependencies.snapshotDatabase  single always-on backup handle
 * @param {object} dependencies.eventBus                                 shared event bus
 */
export function createQueriesService({ database, snapshotDatabase, eventBus }) {
  // Monotonic identifier for every executed sandbox mutation. The POST
  // response and the SSE reload frame both carry it, so a client can tell its
  // own echo apart from a remote mutation deterministically — no wall-clock
  // window needed.
  let mutationSequence = 0;
  // SQLite's built-in internal tables (`sqlite_schema`, `sqlite_master`,
  // `sqlite_sequence`, `sqlite_stat1`, ...) are hidden from the schema browser
  // — the file-browser tree, the editor completions, and the query-tab matcher
  // are all built from the schema enrollment, so omitting them keeps the
  // training UI focused on user tables and views. They remain reachable from
  // the raw SQL sandbox (the unrestricted `execute()` path), and
  // `listTableData()` still serves any built-in name SQLite stores as a real
  // schema row (e.g. `sqlite_sequence`).
  function isBuiltinSqliteName(name) {
    return typeof name === "string" && name.startsWith("sqlite_");
  }

  /**
   * List the entire database structure — every user table/view, its columns,
   * and its row count. SQLite's built-in `sqlite_*` tables are hidden so the
   * file-browser tree lists only user tables and views.
   * @returns {{ tables: Array<object> }}
   */
  function listSchema() {
    const rows = database
      .query("SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') ORDER BY name")
      .all()
      .filter((row) => !isBuiltinSqliteName(row.name));
    const tables = rows.map((row) => {
      const columnRows = database.query(`PRAGMA table_info(${quoteIdentifier(row.name)})`).all();
      let rowCount = null;
      if (row.type === "table") {
        const counted = database
          .query(`SELECT count(*) AS n FROM ${quoteIdentifier(row.name)}`)
          .get();
        rowCount = Number(counted.n);
      }
      return {
        name: row.name,
        type: row.type,
        rowCount,
        columns: columnRows.map((column) => ({
          name: column.name,
          type: column.type,
          notNull: Boolean(column.notnull),
          primaryKey: Boolean(column.pk),
        })),
      };
    });
    return { tables };
  }

  /**
   * List rows for one table or view.
   * @param {string} table
   * @param {number|undefined} limit  row cap (default 100, max 500)
   * @returns {{ table: string, columns: Array<object>, rowCount: number, limit: number, rows: Array<object> }}
   */
  function listTableData(table, limit) {
    if (!table) throw badRequest("Table name is required");

    const tableInfo = database
      .query("SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') AND name = ?")
      .get(table);
    if (!tableInfo) throw notFound(`Table "${table}" does not exist`);

    const columns = database
      .query(`PRAGMA table_info(${quoteIdentifier(table)})`)
      .all()
      .map((column) => ({
        name: column.name,
        type: column.type,
        notNull: Boolean(column.notnull),
        primaryKey: Boolean(column.pk),
      }));

    const { n: rowCount } = database.query(`SELECT count(*) AS n FROM ${quoteIdentifier(table)}`).get();
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const rows = database.query(`SELECT * FROM ${quoteIdentifier(table)} LIMIT ?`).all(safeLimit);

    return { table, columns, rowCount: Number(rowCount), limit: safeLimit, rows };
  }

  // Prepared statement used to widen the invalidation scope: when one of the
  // affected tables carries TRIGGERs, the mutation's ripple is unknowable
  // from SQL alone (a trigger can write any other table) — the scope becomes
  // `allTables` so every client refreshes all its open tabs conservatively.
  const triggerCountStatement = database.prepare(
    "SELECT count(*) AS n FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = ?"
  );

  function tablesCarryTriggers(tableNames) {
    for (const name of tableNames) {
      const row = triggerCountStatement.get(name);
      if (row && Number(row.n) > 0) return true;
    }
    return false;
  }

  /**
   * Execute an arbitrary single SQL statement.
   *
   * The optional `audit` object carries request provenance captured by the
   * HTTP adapter (acting user, source IP, user agent) and is forwarded inside
   * the `data.changed` payload so the synchronization service can append it to
   * the audit trail.
   *
   * @param {string} sql
   * @param {object} [audit]       optional audit metadata
   * @param {number|null} [audit.userId]
   * @param {string|null} [audit.sourceIp]
   * @param {string|null} [audit.userAgent]
   * @param {string|null} [clientId] optional client-supplied request id (max
   *                   64 chars). When present it is reused as the mutation id,
   *                   so the acting browser can recognize its own SSE echo
   *                   immediately at dispatch time instead of racing the
   *                   broadcast order; otherwise a server-generated id is
   *                   assigned.
   * @returns {object} result — `kind: "results"` with columns/rows for
   *                   queries, `kind: "changes"` with changes/lastInsertRowid
   *                   for mutations; mutations also carry the derived mutation
   *                   scope — `affectedTables` (best-effort table names),
   *                   `schemaChanged` (DDL flag), and `allTables` (widened
   *                   when an affected table carries triggers) — plus a
   *                   `mutationId` that the SSE echo repeats so the acting
   *                   client can skip its own broadcast
   */
  function execute(sql, audit = {}, clientId = null) {
    if (!sql || !sql.trim()) throw badRequest("SQL statement is required");
    const trimmed = sql.trim();
    const originalKeyword = firstKeywordOf(trimmed);
    assertSingleStatement(trimmed);
    const firstKeyword = firstKeywordOf(trimmed);
    // PRAGMA has two faces: `PRAGMA table_info(...)` reads rows, while a
    // write-pragma uses an assignment (`PRAGMA foreign_keys = ON`) and is a
    // mutation. Detect the assignment form so it runs through `run()` and
    // reports changes instead of an empty result set.
    const isWritePragma = firstKeyword === "PRAGMA" && /=/.test(trimmed);
    const query = queryFirstKeywords.has(firstKeyword) && !isWritePragma;

    const startedAt = performance.now();
    let rows = [];
    let changes = 0;
    let lastInsertRowid = null;
    let mutating = false;
    let mutationScope = null;
    let mutationId = null;
    let durationMs = 0;
    try {
      const statement = database.query(trimmed);
      if (query) {
        rows = statement.all();
      } else {
        mutating = true;
        // Mirror the mutation onto the snapshot (backup) database FIRST. The
        // snapshot connection is a full schema mirror opened at boot; every
        // sandbox write lands there before the live database is touched, so a
        // failed backup write throws before the live state can change. Restore
        // is a manual file copy of the snapshot over the live database.
        if (snapshotDatabase) {
          snapshotDatabase.query(trimmed).run();
        }
        const result = statement.run();
        changes = Number(result.changes) || 0;
        lastInsertRowid = result.lastInsertRowid == null ? null : Number(result.lastInsertRowid);
      }
    } catch (error) {
      throw badRequest(`SQL error: ${error.message}`);
    }
    durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

    if (mutating) {
      // Derive which tables this statement changes so connected clients can
      // refresh only their affected open tabs instead of re-reading every
      // table. TRIGGERs can ripple into any other table, so when one of the
      // named tables carries triggers the scope widens to `allTables`
      // (conservative and correct) — `allTables: false` is the common,
      // efficient path.
      // The mutation id is what lets the acting client skip its own SSE echo:
      // the browser sends a clientId so it knows the id at dispatch time; a
      // direct API caller without one gets a server-generated sequence id.
      // Either way the response and the broadcast carry the identical value.
      mutationId =
        typeof clientId === "string" && clientId.length > 0 && clientId.length <= 64
          ? clientId
          : "mutation-" + (++mutationSequence);
      mutationScope = statementScope(trimmed);
      if (tablesCarryTriggers(mutationScope.affectedTables)) {
        mutationScope.allTables = true;
      }
      eventBus.emit("data.changed", {
        statement: trimmed,
        keyword: originalKeyword,
        changes,
        lastInsertRowid,
        durationMs,
        mutationId,
        ...mutationScope,
        userId: audit.userId ?? null,
        sourceIp: audit.sourceIp ?? null,
        userAgent: audit.userAgent ?? null,
      });
    }

    const columns = rows.length ? Object.keys(rows[0]) : [];
    return {
      ok: true,
      statement: originalKeyword,
      kind: mutating ? "changes" : "results",
      columns,
      rows,
      changes,
      lastInsertRowid,
      durationMs,
      ...(mutationId != null ? { mutationId } : {}),
      ...(mutationScope || {}),
    };
  }

  return { execute, listSchema, listTableData };
}
