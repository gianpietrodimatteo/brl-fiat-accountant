import type { Migration } from "../migrationRunner";

export const migration0002Sessions: Migration = {
  name: "0002_sessions",
  sql: `
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,
};
