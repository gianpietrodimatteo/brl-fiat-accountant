import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareDatabase } from "../db/prepareDatabase";
import { createExchangeClients } from "../exchanges/exchangeClients";
import { buildApp } from "./buildApp";

describe("GET /api/currencies", () => {
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    prepareDatabase(db);
    app = buildApp({ db, exchangeClients: createExchangeClients("simulated") });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function listCurrencies() {
    return app.inject({ method: "GET", url: "/api/currencies" });
  }

  it("lists exactly the seeded currencies, ordered by code, without authentication", async () => {
    const response = await listCurrencies();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      currencies: [
        { code: "ARS", name: null },
        { code: "COP", name: null },
        { code: "EUR", name: null },
        { code: "MXN", name: null },
        { code: "ZAR", name: null },
      ],
    });
  });

  it("reads the list from the database on every request", async () => {
    db.prepare("DELETE FROM supported_currencies WHERE code = ?").run("COP");
    db.prepare("UPDATE supported_currencies SET name = ? WHERE code = ?").run(
      "Mexican Peso",
      "MXN",
    );

    const response = await listCurrencies();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      currencies: [
        { code: "ARS", name: null },
        { code: "EUR", name: null },
        { code: "MXN", name: "Mexican Peso" },
        { code: "ZAR", name: null },
      ],
    });
  });
});
