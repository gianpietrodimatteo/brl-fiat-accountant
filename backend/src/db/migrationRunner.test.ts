import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { openDatabase } from "./connection";
import { runMigrations } from "./migrationRunner";
import { migrations } from "./migrations";

describe("runMigrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
  });

  it("creates users, supported_currencies, and quotes tables", () => {
    runMigrations(db, migrations);

    const tableNames = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((row) => row.name);

    expect(tableNames).toEqual(expect.arrayContaining(["users", "supported_currencies", "quotes"]));
  });

  it("is idempotent when run twice against the same database", () => {
    runMigrations(db, migrations);

    expect(() => runMigrations(db, migrations)).not.toThrow();

    const { count } = db.prepare("SELECT COUNT(*) as count FROM _migrations").get() as {
      count: number;
    };
    expect(count).toBe(migrations.length);
  });

  it("rejects an unsupported currency code via the CHECK constraint", () => {
    runMigrations(db, migrations);

    expect(() =>
      db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("USD"),
    ).toThrow();

    expect(() =>
      db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("EUR"),
    ).not.toThrow();
  });

  it("enforces the foreign key from quotes.user_id to users.id", () => {
    runMigrations(db, migrations);
    db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("EUR");

    expect(() =>
      db
        .prepare(
          `INSERT INTO quotes (user_id, destination_currency, quantity, unit_price, total_price, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(999, "EUR", 100, 500, 3144, new Date().toISOString()),
    ).toThrow();
  });

  it("rescales a pre-existing centavo-scaled unit_price into BRL sub-units", () => {
    const upToSessions = migrations.filter((m) => m.name !== "0003_rescale_quote_unit_price");
    runMigrations(db, upToSessions);

    db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)").run("alice", 0);
    db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("MXN");
    const info = db
      .prepare(
        `INSERT INTO quotes (user_id, destination_currency, quantity, unit_price, total_price, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(1, "MXN", 10000, 314, 3144, new Date().toISOString());

    expect(runMigrations(db, migrations)).toEqual(["0003_rescale_quote_unit_price"]);

    // 314 centavos is 3.14 BRL, which is 314_000_000 sub-units at the 10^8 scale.
    const row = db
      .prepare("SELECT unit_price FROM quotes WHERE id = ?")
      .get(info.lastInsertRowid) as {
      unit_price: number;
    };
    expect(row.unit_price).toBe(314_000_000);
  });

  it("does not rescale unit_price a second time when migrations are re-run", () => {
    runMigrations(db, migrations);

    db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)").run("alice", 0);
    db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("MXN");
    const info = db
      .prepare(
        `INSERT INTO quotes (user_id, destination_currency, quantity, unit_price, total_price, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(1, "MXN", 10000, 314_375, 3144, new Date().toISOString());

    expect(runMigrations(db, migrations)).toEqual([]);

    const row = db
      .prepare("SELECT unit_price FROM quotes WHERE id = ?")
      .get(info.lastInsertRowid) as {
      unit_price: number;
    };
    expect(row.unit_price).toBe(314_375);
  });

  it("stores monetary values as exact integers, never lossy floating point", () => {
    runMigrations(db, migrations);

    db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)").run("alice", 0);
    db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("MXN");

    // R$31.44 (the business spec's reference check) isn't exactly representable as an
    // IEEE-754 float; stored as an INTEGER count of centavos it round-trips exactly.
    const totalPriceCentavos = 3144;
    const info = db
      .prepare(
        `INSERT INTO quotes (user_id, destination_currency, quantity, unit_price, total_price, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(1, "MXN", 10000, 314, totalPriceCentavos, new Date().toISOString());

    const row = db
      .prepare("SELECT total_price FROM quotes WHERE id = ?")
      .get(info.lastInsertRowid) as { total_price: number };

    expect(row.total_price).toBe(totalPriceCentavos);
    expect(Number.isInteger(row.total_price)).toBe(true);

    const column = (
      db.prepare("PRAGMA table_info(quotes)").all() as { name: string; type: string }[]
    ).find((c) => c.name === "total_price");
    expect(column?.type).toBe("INTEGER");
  });

  describe("against a fresh SQLite file", () => {
    let directory: string;
    let fileDb: Database.Database;

    beforeEach(() => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), "brl-migrations-"));
      fileDb = openDatabase(path.join(directory, "app.db"));
    });

    afterEach(() => {
      fileDb.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });

    it("applies every migration once and re-running applies none of them again", () => {
      expect(runMigrations(fileDb, migrations)).toEqual(migrations.map((m) => m.name));

      expect(runMigrations(fileDb, migrations)).toEqual([]);

      const { count } = fileDb.prepare("SELECT COUNT(*) as count FROM _migrations").get() as {
        count: number;
      };
      expect(count).toBe(migrations.length);
    });
  });
});
