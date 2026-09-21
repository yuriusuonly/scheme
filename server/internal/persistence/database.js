/**
 * @module internal/persistence/database
 * Persistence bootstrap — opens the SQLite database and runs migrations.
 *
 * This is the only module that imports `bun:sqlite` directly; repositories
 * are created from the returned handle in the composition root. The schema is
 * migrated on every startup; no sample data is ever seeded — accounts are
 * created through `/register`.
 *
 * Besides the live database this module also opens the single always-on
 * snapshot database. The snapshot is a full mirror of the live schema that
 * the SQL sandbox writes to first (see `services/queries.js`); it is seeded
 * from the live database with `VACUUM INTO` the first time it appears and is
 * otherwise opened in place — never reset at boot. Restore is a manual file
 * copy of the snapshot over the live database.
 */

import { Database } from "bun:sqlite";
import { joinPath } from "../configuration/join_path.js";
import { runMigrations } from "./migrations.js";

/**
 * Open (or return the existing) SQLite connection and run migrations.
 * @param {string} databasePath
 * @returns {Promise<import("bun:sqlite").Database>}
 */
export async function initializeDatabase(databasePath) {
  const directory = joinPath(databasePath, "..");
  // Bun.write() creates missing parent directories implicitly, so the marker
  // file both guarantees the storage directory exists and is then removed.
  const marker = joinPath(directory, ".scheme-directory");
  await Bun.write(marker, "");
  await Bun.file(marker).delete();

  const database = new Database(databasePath);

  // WAL mode + foreign keys for concurrent reads and relational integrity.
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");

  runMigrations(database);
  return database;
}

/**
 * Open the single always-on snapshot database, seeding it from the live
 * database on first boot so the backup starts as a true copy of the current
 * state (including legacy installations that already hold data). The seed is
 * a full `VACUUM INTO` copy; once the file exists it is opened in place and
 * migrated just like the live database, so sandbox schema evolves in step.
 * @param {string} snapshotPath
 * @param {import("bun:sqlite").Database} sourceDatabase
 * @returns {Promise<import("bun:sqlite").Database>}
 */
export async function openSnapshotDatabase(snapshotPath, sourceDatabase) {
  const directory = joinPath(snapshotPath, "..");
  const file = Bun.file(snapshotPath);
  if (!(await file.exists())) {
    // VACUUM INTO requires the target directory to exist.
    const marker = joinPath(directory, ".scheme-directory");
    await Bun.write(marker, "");
    await Bun.file(marker).delete();
    // Escape single quotes for the SQL string literal.
    const quoted = snapshotPath.split("'").join("''");
    sourceDatabase.exec(`VACUUM INTO '${quoted}'`);
  }
  return initializeDatabase(snapshotPath);
}