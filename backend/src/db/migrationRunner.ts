import type Database from "better-sqlite3";

export interface Migration {
  name: string;
  sql: string;
}

export function runMigrations(db: Database.Database, migrations: Migration[]): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((row) => row.name),
  );

  const newlyApplied: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(migration.name);
    });
    apply();

    newlyApplied.push(migration.name);
  }

  return newlyApplied;
}
