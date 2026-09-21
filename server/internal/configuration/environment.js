/**
 * @module internal/configuration/environment
 * Centralized application configuration.
 *
 * Bun automatically loads `.env` from the project root into `process.env` at
 * startup, so this module performs no manual file parsing — it reads the
 * already-populated environment and derives every project-rooted absolute
 * path from `import.meta.dir` (Bun-native, no `node:path`).
 *
 * This is the only module in the codebase that touches `process.env` for
 * configuration; every consumer imports the exported `configuration` object.
 */

import { joinPath } from "./join_path.js";

// environment.js lives at <root>/server/internal/configuration/, so the
// project root is three levels up from this module's directory.
const ROOT = joinPath(import.meta.dir, "..", "..", "..");

// Bun populates process.env from `.env` before any module evaluates.
const environment = process.env;

const configuration = {
  root: ROOT,
  port: Number(environment.PORT || 3000),
  host: environment.HOST || "0.0.0.0",
  dbPath: joinPath(ROOT, environment.DB_PATH || "storage/scheme.db"),
  // Single always-on snapshot database — every SQL sandbox mutation is
  // mirrored there first; restore is a manual file copy.
  snapshotPath: joinPath(ROOT, environment.SNAPSHOT_PATH || "snapshot/snapshot.db"),
  assetsDirectory: joinPath(ROOT, "assets"),
  pagesDirectory: joinPath(ROOT, "server", "external"),
  sessionTtlSeconds: Number(environment.SESSION_TTL || 86400),
  corsOrigin: environment.CORS_ORIGIN || "*",
};

export { configuration };