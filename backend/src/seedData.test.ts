import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "./db/migrationRunner";
import { migrations } from "./db/migrations";
import { UserRepository } from "./repositories/UserRepository";
import { SupportedCurrencyRepository } from "./repositories/SupportedCurrencyRepository";
import { seedDatabase } from "./seedData";

describe("seedDatabase", () => {
  let db: Database.Database;
  let userRepository: UserRepository;
  let currencyRepository: SupportedCurrencyRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);
    userRepository = new UserRepository(db);
    currencyRepository = new SupportedCurrencyRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates exactly alice, bob and carol with their spreads", () => {
    seedDatabase(db);

    const users = userRepository.listAll();
    expect(users).toHaveLength(3);
    expect(users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: "alice", spreadBasisPoints: 0 }),
        expect.objectContaining({ username: "bob", spreadBasisPoints: 60 }),
        expect.objectContaining({ username: "carol", spreadBasisPoints: 100 }),
      ]),
    );
  });

  it("creates exactly the five supported currencies", () => {
    seedDatabase(db);

    const currencies = currencyRepository.listAll();
    expect(currencies.map((c) => c.code).sort()).toEqual(["ARS", "COP", "EUR", "MXN", "ZAR"]);
  });

  it("is idempotent when run twice", () => {
    seedDatabase(db);
    seedDatabase(db);

    expect(userRepository.listAll()).toHaveLength(3);
    expect(currencyRepository.listAll()).toHaveLength(5);
  });
});
