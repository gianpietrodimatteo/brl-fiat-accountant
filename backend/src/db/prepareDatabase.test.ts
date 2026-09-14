import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupportedCurrencyRepository } from "../repositories/SupportedCurrencyRepository";
import { UserRepository } from "../repositories/UserRepository";
import { openDatabase } from "./connection";
import { migrations } from "./migrations";
import { prepareDatabase } from "./prepareDatabase";

describe("prepareDatabase", () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-database-"));
    filePath = path.join(directory, "app.db");
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function prepareOnce(): string[] {
    const db = openDatabase(filePath);
    try {
      return prepareDatabase(db);
    } finally {
      db.close();
    }
  }

  it("migrates and seeds a fresh database file with no manual steps", () => {
    const applied = prepareOnce();

    expect(applied).toEqual(migrations.map((migration) => migration.name));

    const db = openDatabase(filePath);
    try {
      expect(
        new UserRepository(db)
          .listAll()
          .map((user) => user.username)
          .sort(),
      ).toEqual(["alice", "bob", "carol"]);
      expect(
        new SupportedCurrencyRepository(db)
          .listAll()
          .map((currency) => currency.code)
          .sort(),
      ).toEqual(["ARS", "COP", "EUR", "MXN", "ZAR"]);
    } finally {
      db.close();
    }
  });

  it("applies nothing and adds no rows when the same file is prepared again", () => {
    prepareOnce();

    const appliedOnRestart = prepareOnce();

    expect(appliedOnRestart).toEqual([]);
    const db = openDatabase(filePath);
    try {
      expect(new UserRepository(db).listAll()).toHaveLength(3);
      expect(new SupportedCurrencyRepository(db).listAll()).toHaveLength(5);
    } finally {
      db.close();
    }
  });
});
