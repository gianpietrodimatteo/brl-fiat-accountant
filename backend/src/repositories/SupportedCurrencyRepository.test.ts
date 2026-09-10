import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { SupportedCurrencyRepository } from "./SupportedCurrencyRepository";

describe("SupportedCurrencyRepository", () => {
  let db: Database.Database;
  let repository: SupportedCurrencyRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);
    repository = new SupportedCurrencyRepository(db);

    for (const code of ["EUR", "ARS", "COP", "MXN", "ZAR"]) {
      db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run(code);
    }
  });

  afterEach(() => {
    db.close();
  });

  it("lists all supported currencies", () => {
    const currencies = repository.listAll();

    expect(currencies.map((c) => c.code).sort()).toEqual(["ARS", "COP", "EUR", "MXN", "ZAR"]);
  });

  it("reports a spec'd currency as supported", () => {
    expect(repository.isSupported("EUR")).toBe(true);
  });

  it("reports a non spec'd currency as unsupported", () => {
    expect(repository.isSupported("USD")).toBe(false);
  });
});
