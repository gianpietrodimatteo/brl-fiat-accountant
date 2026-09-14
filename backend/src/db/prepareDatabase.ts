import type Database from "better-sqlite3";
import { seedDatabase } from "../seedData";
import { runMigrations } from "./migrationRunner";
import { migrations } from "./migrations";

/**
 * Brings a database up to date before the server accepts requests: pending migrations first, then
 * the seed. Both steps are idempotent, so running this on every startup against the same file
 * applies nothing twice and adds no duplicate rows. Returns the migrations applied this time.
 */
export function prepareDatabase(db: Database.Database): string[] {
  const applied = runMigrations(db, migrations);
  seedDatabase(db);
  return applied;
}
