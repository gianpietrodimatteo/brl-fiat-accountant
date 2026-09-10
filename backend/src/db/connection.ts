import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");

export function openDatabase(
  filePath: string = process.env.SQLITE_DB_PATH ?? DEFAULT_DB_PATH,
): Database.Database {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
