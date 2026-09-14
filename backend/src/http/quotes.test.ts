import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareDatabase } from "../db/prepareDatabase";
import { MAX_EXACT_COUNT } from "../domain/money";
import { FakeBinanceClient } from "../exchanges/FakeBinanceClient";
import { fakePrices, fakeUnavailable, type FakePriceTable } from "../exchanges/FakeExchangeClient";
import { FakeOkxClient } from "../exchanges/FakeOkxClient";
import { buildApp } from "./buildApp";

const NOW = new Date("2026-09-14T12:00:00.000Z");

/** [[business]]'s reference case: USDT/BRL ask 5.00, USDT/MXN bid 16.00. */
const REFERENCE_BINANCE_PRICES = fakePrices({
  "USDT/BRL": { bid: "4.98", ask: "5.00" },
  "USDT/MXN": { bid: "16.00", ask: "16.10" },
});

/** 100 MXN, in the minor units the API counts. */
const ONE_HUNDRED_MXN = 10_000;

interface QuoteRow {
  id: number;
  user_id: number;
  destination_currency: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  expires_at: string;
}

describe("POST /api/quotes", () => {
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    prepareDatabase(db);
    app = buildQuoteApp();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  /**
   * The Simulated Mode fakes with the reference prices on top of their defaults. OKX is down, so
   * the BRL leg is unambiguously the Binance ask under test.
   */
  function buildQuoteApp(binancePrices: FakePriceTable = REFERENCE_BINANCE_PRICES) {
    return buildApp({
      db,
      exchangeClients: {
        binance: new FakeBinanceClient(binancePrices),
        okx: new FakeOkxClient(fakeUnavailable("simulated OKX outage")),
      },
      clock: () => NOW,
    });
  }

  async function loginToken(username: string, target: FastifyInstance = app): Promise<string> {
    const response = await target.inject({
      method: "POST",
      url: "/api/login",
      payload: { username },
    });
    return response.json().token;
  }

  async function createQuote(
    payload: unknown,
    { username = "bob", target = app }: { username?: string; target?: FastifyInstance } = {},
  ) {
    const token = await loginToken(username, target);
    return target.inject({
      method: "POST",
      url: "/api/quotes",
      headers: { authorization: `Bearer ${token}` },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  }

  function quoteRows(): QuoteRow[] {
    return db.prepare("SELECT * FROM quotes ORDER BY id").all() as QuoteRow[];
  }

  describe("a created quote", () => {
    it("reproduces the reference R$31.44 for bob, expiring 10 000 ms after creation", async () => {
      const response = await createQuote({
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      });

      expect(response.statusCode).toBe(201);
      const { quote } = response.json();
      expect(quote).toEqual({
        id: expect.any(Number),
        destinationCurrency: "MXN",
        quantity: 10000,
        unitPrice: 314375,
        totalPrice: 3144,
        createdAt: "2026-09-14T12:00:00.000Z",
        expiresAt: "2026-09-14T12:00:10.000Z",
      });
      expect(Date.parse(quote.expiresAt) - Date.parse(quote.createdAt)).toBe(10_000);
    });

    it("sends every integer as the stored column value, with no fractional number anywhere", async () => {
      const response = await createQuote({
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      });

      const { quote } = response.json();
      const [row] = quoteRows();
      expect(quote).toEqual({
        id: row.id,
        destinationCurrency: row.destination_currency,
        quantity: row.quantity,
        unitPrice: row.unit_price,
        totalPrice: row.total_price,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      });
      for (const field of ["id", "quantity", "unitPrice", "totalPrice"]) {
        expect(Number.isInteger(quote[field])).toBe(true);
      }
      // Outside string literals, a JSON number with a `.` or an exponent would be a float token.
      const numbersOnly = response.body.replace(/"(?:[^"\\]|\\.)*"/g, '""');
      expect(numbersOnly).not.toMatch(/[.eE]/);
    });

    it("applies the token's user's spread: alice (0%) pays less than bob (0.6%)", async () => {
      const request = { destinationCurrency: "MXN", quantity: ONE_HUNDRED_MXN };

      const asAlice = (await createQuote(request, { username: "alice" })).json();
      const asBob = (await createQuote(request, { username: "bob" })).json();

      expect(asAlice.quote.totalPrice).toBe(3125);
      expect(asBob.quote.totalPrice).toBe(3144);
      expect(asAlice.quote.totalPrice).toBeLessThan(asBob.quote.totalPrice);

      const users = db.prepare("SELECT id, username FROM users").all() as {
        id: number;
        username: string;
      }[];
      const idOf = (username: string) => users.find((user) => user.username === username)?.id;
      expect(quoteRows().map((row) => row.user_id)).toEqual([idOf("alice"), idOf("bob")]);
    });
  });

  describe("request validation", () => {
    it.each([
      ["a numeric string quantity", { destinationCurrency: "MXN", quantity: "10000" }],
      ["a fractional quantity", { destinationCurrency: "MXN", quantity: 100.5 }],
      ["an omitted quantity", { destinationCurrency: "MXN" }],
      ["an omitted currency", { quantity: ONE_HUNDRED_MXN }],
      ["a non-string currency", { destinationCurrency: 484, quantity: ONE_HUNDRED_MXN }],
      ["a userId in the body", { destinationCurrency: "MXN", quantity: 10000, userId: 1 }],
      ["a missing body", undefined],
    ])("rejects %s with 400 validation_error", async (_label, payload) => {
      const response = await createQuote(payload);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: "validation_error", message: expect.any(String) },
      });
      expect(quoteRows()).toEqual([]);
    });

    it.each([0, -1])("rejects a well-typed quantity of %d with 400 invalid_quantity", async (q) => {
      const response = await createQuote({ destinationCurrency: "MXN", quantity: q });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: "invalid_quantity", message: expect.any(String) },
      });
      expect(quoteRows()).toEqual([]);
    });

    it.each(["USD", "mxn"])(
      "rejects destinationCurrency %s with 400 unsupported_currency",
      async (destinationCurrency) => {
        const response = await createQuote({ destinationCurrency, quantity: ONE_HUNDRED_MXN });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          error: { code: "unsupported_currency", message: expect.any(String) },
        });
        expect(quoteRows()).toEqual([]);
      },
    );
  });

  describe("quantity caps", () => {
    it("rejects a quantity past 2^53 − 1 with 422 and that cap as maxQuantity", async () => {
      const response = await createQuote({
        destinationCurrency: "MXN",
        quantity: MAX_EXACT_COUNT + 1,
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: {
          code: "quantity_too_large",
          message: expect.any(String),
          maxQuantity: MAX_EXACT_COUNT,
        },
      });
      expect(quoteRows()).toEqual([]);
    });

    it("rejects a quantity whose total would not fit, with the rate's own maxQuantity", async () => {
      // EUR costs R$5.50 each at these prices, so 2^53 − 1 EUR cents is far past the total cap.
      const response = await createQuote({
        destinationCurrency: "EUR",
        quantity: MAX_EXACT_COUNT,
      });

      expect(response.statusCode).toBe(422);
      const { error } = response.json();
      expect(error.code).toBe("quantity_too_large");
      expect(Number.isInteger(error.maxQuantity)).toBe(true);
      expect(error.maxQuantity).toBeGreaterThan(0);
      expect(error.maxQuantity).toBeLessThan(MAX_EXACT_COUNT);
      expect(quoteRows()).toEqual([]);
    });
  });

  describe("no quote capability", () => {
    it("answers 503 with a client-safe message, writes nothing, and keeps serving", async () => {
      const outageApp = buildQuoteApp({
        ...REFERENCE_BINANCE_PRICES,
        "USDT/MXN": fakeUnavailable("Binance USDTMXN request timed out after 5000ms"),
      });
      try {
        const response = await createQuote(
          { destinationCurrency: "MXN", quantity: ONE_HUNDRED_MXN },
          { target: outageApp },
        );

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
          error: { code: "no_quote_capability", message: expect.any(String) },
        });
        expect(response.body).not.toContain("Binance");
        expect(response.body).not.toContain("timed out");
        expect(quoteRows()).toEqual([]);

        const nextQuote = await createQuote(
          { destinationCurrency: "ARS", quantity: ONE_HUNDRED_MXN },
          { target: outageApp },
        );
        const currencies = await outageApp.inject({ method: "GET", url: "/api/currencies" });
        expect(nextQuote.statusCode).toBe(201);
        expect(currencies.statusCode).toBe(200);
      } finally {
        await outageApp.close();
      }
    });
  });

  describe("authentication", () => {
    it.each([
      ["no Authorization header", undefined],
      ["an unknown token", "Bearer 00000000-0000-4000-8000-000000000000"],
    ])("rejects %s with 401 unauthorized and writes nothing", async (_label, authorization) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/quotes",
        headers: authorization === undefined ? {} : { authorization },
        payload: { destinationCurrency: "MXN", quantity: ONE_HUNDRED_MXN },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "unauthorized", message: expect.any(String) },
      });
      expect(quoteRows()).toEqual([]);
    });

    it("answers an unknown_user result with 401 unauthorized", async () => {
      // A session always points at an existing user, so this outcome can only be forced.
      vi.spyOn(app.services.quoteService, "createQuote").mockResolvedValue({
        status: "unknown_user",
      });

      const response = await createQuote({
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "unauthorized", message: expect.any(String) },
      });
    });
  });
});
