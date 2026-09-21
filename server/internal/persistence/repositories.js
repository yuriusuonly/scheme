/**
 * @module internal/persistence/repositories
 * Repository factory — a small data-access layer over the raw SQLite handle.
 *
 * Each repository groups prepared queries for one aggregate (users, sessions,
 * synchronization) and returns plain mapped row objects. Services depend on
 * these repositories rather than on SQL, so swapping persistence is a
 * single-file change.
 */

/**
 * Row mapping helpers.
 */
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapPublicUser(row) {
  return row
    ? {
        id: row.id,
        username: row.username,
        role: row.role,
        createdAt: row.createdAt,
      }
    : null;
}

function mapSession(row) {
  return row
    ? {
        id: row.id,
        userId: row.userId,
        token: row.token,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      }
    : null;
}

function mapSynchronizationEntry(row) {
  return row
    ? {
        id: row.id,
        operation: row.operation,
        userId: row.userId,
        sourceIp: row.sourceIp,
        userAgent: row.userAgent,
        synchronizedAt: row.synchronizedAt,
        createdAt: row.createdAt,
      }
    : null;
}

/**
 * Create the full repository set bound to one database handle.
 * @param {import("bun:sqlite").Database} database
 */
export function createRepositories(database) {
  const statements = {
    users: {
      selectByUsername: database.query(`SELECT * FROM users WHERE username = ?`),
      selectById: database.query(`SELECT id, username, role, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?`),
      insert: database.query(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`),
    },
    sessions: {
      selectByToken: database.query(`SELECT id, user_id AS userId, token, expires_at AS expiresAt, created_at AS createdAt FROM sessions WHERE token = ? AND expires_at > datetime('now')`),
      insert: database.query(`INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`),
      deleteByToken: database.query(`DELETE FROM sessions WHERE token = ?`),
    },
    synchronization: {
      selectUnsynced: database.query(`SELECT id, operation, user_id AS userId, source_ip AS sourceIp, user_agent AS userAgent, synchronized_at AS synchronizedAt, created_at AS createdAt FROM synchronizations WHERE synchronized_at IS NULL ORDER BY id`),
      insert: database.query(`INSERT INTO synchronizations (operation, user_id, source_ip, user_agent) VALUES (?, ?, ?, ?)`),
    },
  };

  return {
    users: {
      getByUsername(username) {
        return mapUser(statements.users.selectByUsername.get(username));
      },
      getPublicById(id) {
        return mapPublicUser(statements.users.selectById.get(id));
      },
      insert({ username, password, role }) {
        const result = statements.users.insert.run(username, password, role || "editor");
        const id = Number(result.lastInsertRowid);
        return mapPublicUser(statements.users.selectById.get(id));
      },
    },
    sessions: {
      getByToken(token) {
        return mapSession(statements.sessions.selectByToken.get(token));
      },
      insert({ id, userId, token, expiresAt }) {
        statements.sessions.insert.run(id, userId, token, expiresAt);
      },
      deleteByToken(token) {
        statements.sessions.deleteByToken.run(token);
      },
    },
    synchronization: {
      listUnsynced() {
        return statements.synchronization.selectUnsynced.all().map(mapSynchronizationEntry);
      },
      insert({ operation, userId, sourceIp, userAgent }) {
        statements.synchronization.insert.run(operation, userId ?? null, sourceIp ?? null, userAgent ?? null);
      },
      markSynced(ids) {
        if (!ids.length) return;
        const placeholders = ids.map(() => "?").join(",");
        database.query(
          `UPDATE synchronizations SET synchronized_at = datetime('now') WHERE id IN (${placeholders})`
        ).run(...ids);
      },
    },
  };
}
