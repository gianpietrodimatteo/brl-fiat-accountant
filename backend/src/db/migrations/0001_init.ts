import type { Migration } from "../migrationRunner";

export const migration0001Init: Migration = {
  name: "0001_init",
  sql: `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      spread INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE supported_currencies (
      code TEXT PRIMARY KEY CHECK (code IN ('EUR', 'ARS', 'COP', 'MXN', 'ZAR')),
      name TEXT
    );

    CREATE TABLE quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      destination_currency TEXT NOT NULL REFERENCES supported_currencies(code),
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      total_price INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      confirmed_at TEXT
    );
  `,
};
