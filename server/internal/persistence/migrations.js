/**
 * @module internal/persistence/migrations
 * SQLite schema migrations.
 *
 * The synchronous `runMigrations(database)` call is idempotent: each table is
 * created with `IF NOT EXISTS` after legacy names are migrated once.
 *
 * Legacy tables are renamed in place so existing databases keep their data:
 *   - `sync_log`             → `synchronizations` (flat-persistence model)
 *   - `_synchronization_log` → `synchronizations` (private-prefix model)
 *   - `synchronization_log`  → `synchronizations` (previous audit name)
 *   - `_users`               → `users`
 *   - `_sessions`            → `sessions`
 *
 * The retired spreadsheet grid `records` (and its indexes) is dropped wherever
 * it still exists. The grid-era synchronization log shape (a `record_id`
 * foreign key pointing at the removed grid) is dropped and rebuilt; existing
 * logs are upgraded in place into the audit schema — `operation` absorbs the
 * old `statement` column, the execution-fact columns (`changes`,
 * `last_insert_rowid`, `duration_ms`) are dropped, and `synced_at` is renamed
 * to `synchronized_at` so the pending/acknowledge flow keeps working. The
 * audit table is finally rebuilt into the canonical column order (`id`,
 * `created_at`, `synchronized_at`, `operation`, `user_id`, `source_ip`,
 * `user_agent`) whenever an older schema has a different physical order —
 * SQLite cannot reorder columns with `ALTER TABLE`, so the table is recreated
 * and the existing rows are copied. The retired snapshot metadata registry
 * `snapshots` (the backup/restore UI of an earlier model) is dropped wherever
 * it still exists — the snapshot feature now keeps a single backup database
 * file, with no metadata table.
 */

/**
 * Remove the leading/trailing whitespace from a table name — practicality
 * shim for the quoting below.
 */
function quoteTableName(name) {
  return `"${name.split('"').join('""')}"`;
}

/**
 * Return the column names of a table (empty when the table does not exist).
 * @param {import("bun:sqlite").Database} database
 * @param {string} table
 * @returns {string[]}
 */
function columnNamesOf(database, table) {
  return database
    .query(`PRAGMA table_info(${quoteTableName(table)})`)
    .all()
    .map((column) => column.name);
}

/**
 * Add a column to an existing table when it is missing entirely.
 * @param {import("bun:sqlite").Database} database
 * @param {string} table
 * @param {string[]} columns  the table's current columns
 * @param {string} name
 * @param {string} ddl        full column definition (name included)
 */
function addColumnIfMissing(database, table, columns, name, ddl) {
  if (columns.includes(name)) return;
  database.exec(`ALTER TABLE ${quoteTableName(table)} ADD COLUMN ${ddl}`);
}

/**
 * Drop a column from an existing table when it is present.
 * @param {import("bun:sqlite").Database} database
 * @param {string} table
 * @param {string} name
 */
function dropColumnIfExists(database, table, name) {
  if (!columnNamesOf(database, table).includes(name)) return;
  database.exec(`ALTER TABLE ${quoteTableName(table)} DROP COLUMN ${name}`);
}

/**
 * Rename a table only when the source exists and the target is free. SQLite
 * updates foreign-key references in other tables automatically with modern
 * `legacy_alter_table = OFF`, so the remaining schema stays consistent.
 * @param {import("bun:sqlite").Database} database
 * @param {string} from  existing table name
 * @param {string} to    desired table name
 */
function renameTableIfExists(database, from, to) {
  const source = database.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(from);
  if (!source) return;
  const target = database.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(to);
  if (target) return;
  database.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
}

/**
 * Apply the schema migrations on a fresh or existing database.
 * @param {import("bun:sqlite").Database} database
 */
export function runMigrations(database) {
  // Migrate legacy table names in place (old → current). The audit table is
  // `synchronizations` today; older deployments used `synchronization_log`
  // (and its flat `sync_log` / private `_synchronization_log` predecessors).
  renameTableIfExists(database, "sync_log", "synchronizations");
  renameTableIfExists(database, "_synchronization_log", "synchronizations");
  renameTableIfExists(database, "synchronization_log", "synchronizations");
  renameTableIfExists(database, "_users", "users");
  renameTableIfExists(database, "_sessions", "sessions");

  // A legacy grid-era synchronization log still carries a `record_id` column
  // (a foreign key to the removed spreadsheet grid) — that shape cannot be
  // upgraded, so drop it and rebuild it from the audit schema below. Then
  // drop the retired spreadsheet grid itself.
  if (columnNamesOf(database, "synchronizations").includes("record_id")) {
    database.exec("DROP TABLE IF EXISTS synchronizations");
  }
  database.exec("DROP TABLE IF EXISTS records");

  // Drop the retired snapshot metadata registry — the backup feature now keeps
  // a single snapshot database file with no ledger table.
  database.exec("DROP TABLE IF EXISTS snapshots");

  database.exec(`CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'editor',
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT    NOT NULL UNIQUE,
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
  `);

  // The synchronization table is the audit trail: every mutation is recorded
  // with its SQL statement (in `operation`), the acting user, and the request
  // provenance (source IP, user agent); `synchronized_at` marks entries a
  // client has consumed through the pending/acknowledge flow. The schema is
  // created fresh below; existing logs are upgraded in place — `operation`
  // absorbs the old `statement` column, the execution-fact columns (`changes`,
  // `last_insert_rowid`, `duration_ms`) are dropped, and `synced_at` is
  // renamed to `synchronized_at`.
  const syncLogColumns = columnNamesOf(database, "synchronizations");
  if (syncLogColumns.length === 0) {
    database.exec(`CREATE TABLE synchronizations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      synchronized_at TEXT,
      operation       TEXT    NOT NULL,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      source_ip       TEXT,
      user_agent      TEXT
    );
    `);
  } else {
    // Rename the sync marker to its full word before touching the data.
    if (syncLogColumns.includes("synced_at")) {
      database.exec("ALTER TABLE synchronizations RENAME COLUMN synced_at TO synchronized_at");
    }

    // The previous model stored the statement separately and used `operation`
    // as a label ("sql") — fold the statement into `operation` and drop the
    // execution-fact columns that are no longer audited.
    if (syncLogColumns.includes("statement")) {
      database.exec(`
        UPDATE synchronizations
        SET operation = statement
        WHERE statement IS NOT NULL AND statement != '';
      `);
      database.exec("ALTER TABLE synchronizations DROP COLUMN statement");
    }
    dropColumnIfExists(database, "synchronizations", "changes");
    dropColumnIfExists(database, "synchronizations", "last_insert_rowid");
    dropColumnIfExists(database, "synchronizations", "duration_ms");
    addColumnIfMissing(
      database,
      "synchronizations",
      columnNamesOf(database, "synchronizations"),
      "synchronized_at",
      "synchronized_at TEXT"
    );

    // Best-effort migration of the legacy JSON payload into `operation` (the
    // old payload-shaped audit carried the statement under `$.statement`).
    if (syncLogColumns.includes("payload")) {
      database.exec(`
        UPDATE synchronizations
        SET operation = COALESCE(NULLIF(json_extract(payload, '$.statement'), ''), operation)
        WHERE payload IS NOT NULL AND payload != '';
      `);
      database.exec("ALTER TABLE synchronizations DROP COLUMN payload");
    }
  }

  // Enforce the canonical column order by rebuilding the table when an older
  // schema has a different physical order. SQLite cannot reorder columns with
  // ALTER TABLE, so the table is recreated and the existing rows are copied
  // into the desired order; after the first boot the orders match and this
  // step is skipped on subsequent runs.
  const canonicalSyncColumns = [
    "id",
    "created_at",
    "synchronized_at",
    "operation",
    "user_id",
    "source_ip",
    "user_agent",
  ];
  const currentSyncColumns = columnNamesOf(database, "synchronizations");
  if (
    currentSyncColumns.length === canonicalSyncColumns.length &&
    currentSyncColumns.some((name, index) => name !== canonicalSyncColumns[index])
  ) {
    database.exec(`
      DROP TABLE IF EXISTS synchronizations_rebuild;
      CREATE TABLE synchronizations_rebuild (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        synchronized_at TEXT,
        operation       TEXT    NOT NULL,
        user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
        source_ip       TEXT,
        user_agent      TEXT
      );
      INSERT INTO synchronizations_rebuild
        (id, created_at, synchronized_at, operation, user_id, source_ip, user_agent)
        SELECT
          id, COALESCE(created_at, datetime('now')), synchronized_at,
          operation, user_id, source_ip, user_agent
        FROM synchronizations;
      DROP TABLE synchronizations;
      ALTER TABLE synchronizations_rebuild RENAME TO synchronizations;
    `);
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_synchronizations_user  ON synchronizations(user_id);
    CREATE INDEX IF NOT EXISTS idx_synchronizations_synced ON synchronizations(synchronized_at);
  `);
}
