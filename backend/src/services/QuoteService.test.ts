import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { QUOTE_TTL_MS } from "../domain/quoteLifecycle";
import { FakeBinanceClient } from "../exchanges/FakeBinanceClient";
import { fakePrices, fakeUnavailable, type FakePriceTable } from "../exchanges/FakeExchangeClient";
import { FakeOkxClient } from "../exchanges/FakeOkxClient";
import { QuoteRepository } from "../repositories/QuoteRepository";
import { SupportedCurrencyRepository } from "../repositories/SupportedCurrencyRepository";
import { UserRepository } from "../repositories/UserRepository";
import { seedDatabase } from "../seedData";
import { MarketDataService } from "./MarketDataService";
import { QuoteService, type CreateQuoteResult } from "./QuoteService";

/**
 * The [[business]] reference case: USDT/BRL ask 5.00 and USDT/MXN bid 16.00, which with bob's
 * 0.6% spread must make 100 MXN cost exactly R$31.44.
 */
const REFERENCE_BINANCE_PRICES = fakePrices({
  "USDT/BRL": { bid: "4.98", ask: "5.00" },
  "USDT/MXN": { bid: "16.00", ask: "16.10" },
});

/** 100 MXN, in the minor units `quotes.quantity` counts. */
const ONE_HUNDRED_MXN = 10_000;

describe("QuoteService", () => {
  let db: Database.Database;
  let userRepository: UserRepository;
  let quoteRepository: QuoteRepository;
  let now: Date;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);
    seedDatabase(db);

    userRepository = new UserRepository(db);
    quoteRepository = new QuoteRepository(db);
    now = new Date("2026-09-12T10:00:00.000Z");
  });

  afterEach(() => {
    db.close();
  });

  /**
   * Builds the service against the Simulated Mode fakes, per the backend rule that consumers of
   * `ExchangeClient` reuse them rather than adding a second mocking layer. OKX defaults to
   * unavailable so the BRL leg is unambiguously the Binance ask under test.
   */
  function buildService({
    binancePrices = REFERENCE_BINANCE_PRICES,
    okxDown = true,
  }: { binancePrices?: FakePriceTable; okxDown?: boolean } = {}): QuoteService {
    const binance = new FakeBinanceClient(binancePrices);
    const okx = okxDown
      ? new FakeOkxClient(fakeUnavailable("simulated OKX outage"))
      : new FakeOkxClient();

    return new QuoteService(
      userRepository,
      new SupportedCurrencyRepository(db),
      quoteRepository,
      new MarketDataService(binance, okx),
      () => now,
    );
  }

  function userId(username: string): number {
    const user = userRepository.findByUsername(username);
    if (!user) throw new Error(`expected seeded user ${username}`);
    return user.id;
  }

  function quoteRowCount(): number {
    const row = db.prepare("SELECT COUNT(*) AS count FROM quotes").get() as { count: number };
    return row.count;
  }

  function created(result: CreateQuoteResult) {
    if (result.status !== "created") {
      throw new Error(`expected a created quote, got ${result.status}`);
    }
    return result.quote;
  }

  describe("pricing and persistence", () => {
    it("persists the reference case total of R$31.44 for bob's 0.6% spread", async () => {
      const result = await buildService().createQuote({
        userId: userId("bob"),
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      });

      const quote = created(result);
      expect(quote.totalPrice).toBe(3144);
      expect(quoteRepository.findById(quote.id)?.totalPrice).toBe(3144);
    });

    it("carries only the quoting user's own spread", async () => {
      const service = buildService();
      const request = { destinationCurrency: "MXN", quantity: ONE_HUNDRED_MXN };

      const alice = created(await service.createQuote({ ...request, userId: userId("alice") }));
      const bob = created(await service.createQuote({ ...request, userId: userId("bob") }));
      const carol = created(await service.createQuote({ ...request, userId: userId("carol") }));

      // Identical market data, three spreads: 0%, 0.6% and 1% of the R$31.25 composed cost.
      expect([alice.totalPrice, bob.totalPrice, carol.totalPrice]).toEqual([3125, 3144, 3157]);
    });

    it("persists the requested currency and quantity against the requesting user", async () => {
      // Simulated Mode's own standing prices, with OKX up, so the default fakes are exercised.
      const result = await buildService({ okxDown: false }).createQuote({
        userId: userId("alice"),
        destinationCurrency: "EUR",
        quantity: 500,
      });

      expect(created(result)).toEqual(
        expect.objectContaining({
          userId: userId("alice"),
          destinationCurrency: "EUR",
          quantity: 500,
          confirmedAt: null,
        }),
      );
    });
  });

  describe("the 10 second validity window", () => {
    it("expires a quote exactly 10 000 ms after the clock's creation instant", async () => {
      const quote = created(
        await buildService().createQuote({
          userId: userId("bob"),
          destinationCurrency: "MXN",
          quantity: ONE_HUNDRED_MXN,
        }),
      );

      expect(quote.expiresAt.getTime() - quote.createdAt.getTime()).toBe(10_000);
      expect(quote.expiresAt.getTime()).toBe(now.getTime() + QUOTE_TTL_MS);
    });

    it("stores both timestamps as ISO UTC, so no expiry path can be shifted by the host's timezone", async () => {
      const quote = created(
        await buildService().createQuote({
          userId: userId("bob"),
          destinationCurrency: "MXN",
          quantity: ONE_HUNDRED_MXN,
        }),
      );

      const row = db
        .prepare("SELECT created_at, expires_at FROM quotes WHERE id = ?")
        .get(quote.id) as {
        created_at: string;
        expires_at: string;
      };

      // SQLite's `datetime('now')` default would give "2026-09-12 10:00:00": no designator, so
      // it would parse as local time and move the window by the host's UTC offset.
      expect(row.created_at).toBe("2026-09-12T10:00:00.000Z");
      expect(row.expires_at).toBe("2026-09-12T10:00:10.000Z");
      expect(new Date(row.created_at).getTime()).toBe(now.getTime());
      expect(new Date(row.expires_at).getTime()).toBe(now.getTime() + QUOTE_TTL_MS);
    });
  });

  describe("rejections", () => {
    it("rejects a currency the supported list does not carry, writing no row", async () => {
      const service = buildService();

      for (const destinationCurrency of ["GBP", "usd", ""]) {
        const result = await service.createQuote({
          userId: userId("bob"),
          destinationCurrency,
          quantity: ONE_HUNDRED_MXN,
        });

        expect(result).toEqual({ status: "unsupported_currency" });
      }

      expect(quoteRowCount()).toBe(0);
    });

    it("reports no quote capability and writes no row when Binance cannot serve a leg", async () => {
      const service = buildService({
        binancePrices: { ...REFERENCE_BINANCE_PRICES, "USDT/BRL": fakeUnavailable("Binance down") },
      });

      const result = await service.createQuote({
        userId: userId("bob"),
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      });

      expect(result.status).toBe("no_quote_capability");
      expect(quoteRowCount()).toBe(0);
    });

    it("rejects an unknown user, writing no row", async () => {
      const result = await buildService().createQuote({
        userId: 9999,
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      });

      expect(result).toEqual({ status: "unknown_user" });
      expect(quoteRowCount()).toBe(0);
    });

    it("rejects a non-positive or fractional quantity, writing no row", async () => {
      const service = buildService();

      for (const quantity of [0, -1, -10_000, 1.5, 10_000.5, Number.NaN]) {
        const result = await service.createQuote({
          userId: userId("bob"),
          destinationCurrency: "MXN",
          quantity,
        });

        expect(result).toEqual({ status: "invalid_quantity" });
      }

      expect(quoteRowCount()).toBe(0);
    });

    it("rejects a quantity whose total exceeds the exact integer range, writing no row", async () => {
      // At the EUR standing bid of 0.91 this total is ~5e16 centavos, past Number.MAX_SAFE_INTEGER.
      const result = await buildService().createQuote({
        userId: userId("bob"),
        destinationCurrency: "EUR",
        quantity: Number.MAX_SAFE_INTEGER,
      });

      expect(result).toEqual({ status: "invalid_quantity" });
      expect(quoteRowCount()).toBe(0);
    });

    it("reports no quote capability and writes no row when Binance quotes a zero price", async () => {
      const service = buildService({
        binancePrices: fakePrices({
          "USDT/BRL": { bid: "4.98", ask: "5.00" },
          "USDT/MXN": { bid: "0", ask: "16.10" },
        }),
      });

      const result = await service.createQuote({
        userId: userId("bob"),
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      });

      expect(result.status).toBe("no_quote_capability");
      expect(quoteRowCount()).toBe(0);
    });

    it("never throws on a rejection path, returning a typed result instead", async () => {
      const service = buildService({
        binancePrices: { "USDT/BRL": fakeUnavailable("Binance down") },
      });

      await expect(
        service.createQuote({ userId: 9999, destinationCurrency: "", quantity: -1 }),
      ).resolves.toEqual({ status: "invalid_quantity" });
    });
  });
});
