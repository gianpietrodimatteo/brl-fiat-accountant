import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { QUOTE_TTL_MS, isExpired } from "../domain/quoteLifecycle";
import type { Quote } from "../domain/Quote";
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
      // EUR is listed there only as EUR/USDT, as on live Binance, so it is priced from that pair's
      // 1.10 ask: the reference 5.00 Binance BRL ask (cheaper than OKX's 5.39) × 1.10 × 5.00 EUR
      // at alice's 0% is R$27.50.
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
          totalPrice: 2750,
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

      for (const quantity of [
        0,
        -1,
        -10_000,
        1.5,
        10_000.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ]) {
        const result = await service.createQuote({
          userId: userId("bob"),
          destinationCurrency: "MXN",
          quantity,
        });

        expect(result).toEqual({ status: "invalid_quantity" });
      }

      expect(quoteRowCount()).toBe(0);
    });

    it("rejects a quantity past what quotes.quantity can hold exactly, before any lookup", async () => {
      const service = buildService();

      for (const quantity of [2 ** 53, 1e20]) {
        // An unknown user and an unsupported currency would each be rejected, so getting this
        // result shows the bound is checked before either lookup.
        const result = await service.createQuote({
          userId: 9999,
          destinationCurrency: "",
          quantity,
        });

        expect(result).toEqual({
          status: "quantity_too_large",
          maxQuantity: Number.MAX_SAFE_INTEGER,
        });
      }

      expect(quoteRowCount()).toBe(0);
    });

    describe("a total past the exact integer range", () => {
      // 5.00 / 0.90 × bob's 1.006 is ~5.59 centavos per EUR cent, so the total, not the quantity,
      // is what runs out of exact integers first. The bound is floor((2^53 − 1) / that rate).
      const EXPENSIVE_EUR_PRICES = {
        ...REFERENCE_BINANCE_PRICES,
        ...fakePrices({ "USDT/EUR": { bid: "0.90", ask: "0.91" } }),
      };
      const MAX_EUR_QUANTITY_FOR_BOB = 1_611_626_109_198_189;

      it("is rejected with the largest quantity that would fit, writing no row", async () => {
        const service = buildService({ binancePrices: EXPENSIVE_EUR_PRICES });

        for (const quantity of [MAX_EUR_QUANTITY_FOR_BOB + 1, Number.MAX_SAFE_INTEGER]) {
          const result = await service.createQuote({
            userId: userId("bob"),
            destinationCurrency: "EUR",
            quantity,
          });

          expect(result).toEqual({
            status: "quantity_too_large",
            maxQuantity: MAX_EUR_QUANTITY_FOR_BOB,
          });
        }

        expect(quoteRowCount()).toBe(0);
      });

      it("is quotable right at that maximum, and the total survives the database exactly", async () => {
        const quote = created(
          await buildService({ binancePrices: EXPENSIVE_EUR_PRICES }).createQuote({
            userId: userId("bob"),
            destinationCurrency: "EUR",
            quantity: MAX_EUR_QUANTITY_FOR_BOB,
          }),
        );

        expect(quote.totalPrice).toBe(9_007_199_254_740_990);
        expect(quoteRepository.findById(quote.id)).toEqual(
          expect.objectContaining({
            quantity: MAX_EUR_QUANTITY_FOR_BOB,
            totalPrice: 9_007_199_254_740_990,
          }),
        );
      });
    });

    it("reports no quote capability when the rate itself is too extreme to store", async () => {
      // ~5e10 BRL per MXN puts one cent's unit_price past the exact integer range, whatever the
      // quantity — a price nothing can be quoted from rather than a problem with the request.
      const service = buildService({
        binancePrices: fakePrices({
          "USDT/BRL": { bid: "4.98", ask: "5.00" },
          "USDT/MXN": { bid: "0.0000000001", ask: "16.10" },
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

  /** Creates bob's (or the named user's) reference 100 MXN quote at the current clock. */
  async function referenceQuote(service: QuoteService, username = "bob"): Promise<Quote> {
    return created(
      await service.createQuote({
        userId: userId(username),
        destinationCurrency: "MXN",
        quantity: ONE_HUNDRED_MXN,
      }),
    );
  }

  function advanceClock(milliseconds: number): void {
    now = new Date(now.getTime() + milliseconds);
  }

  function storedConfirmedAt(quoteId: number): string | null {
    const row = db.prepare("SELECT confirmed_at FROM quotes WHERE id = ?").get(quoteId) as {
      confirmed_at: string | null;
    };
    return row.confirmed_at;
  }

  function confirmedRowCount(): number {
    const row = db
      .prepare("SELECT COUNT(*) AS count FROM quotes WHERE confirmed_at IS NOT NULL")
      .get() as { count: number };
    return row.count;
  }

  describe("confirmQuote", () => {
    it("confirms the owner's quote inside its window, stamping the injected clock's instant", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);
      advanceClock(3_000);

      const result = service.confirmQuote({ userId: userId("bob"), quoteId: quote.id });

      expect(result).toEqual({ status: "confirmed", quote: { ...quote, confirmedAt: now } });
      expect(storedConfirmedAt(quote.id)).toBe("2026-09-12T10:00:03.000Z");
    });

    it("yields one confirmed and one already-confirmed result for two concurrent calls", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);
      const request = { userId: userId("bob"), quoteId: quote.id };

      const results = await Promise.all([
        Promise.resolve().then(() => service.confirmQuote(request)),
        Promise.resolve().then(() => service.confirmQuote(request)),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        "already_confirmed",
        "confirmed",
      ]);
      expect(confirmedRowCount()).toBe(1);
    });

    it("yields exactly one confirmed result for a burst of ten concurrent calls", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);
      const request = { userId: userId("bob"), quoteId: quote.id };

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          Promise.resolve().then(() => service.confirmQuote(request)),
        ),
      );

      const statuses = results.map((result) => result.status);
      expect(statuses.filter((status) => status === "confirmed")).toHaveLength(1);
      expect(statuses.filter((status) => status === "already_confirmed")).toHaveLength(9);
      expect(confirmedRowCount()).toBe(1);
    });

    it("confirms at exactly expires_at, the window's last valid instant", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);
      advanceClock(QUOTE_TTL_MS);

      expect(service.confirmQuote({ userId: userId("bob"), quoteId: quote.id }).status).toBe(
        "confirmed",
      );
    });

    it("rejects a quote past expires_at, recording it nowhere", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);
      advanceClock(QUOTE_TTL_MS + 1);

      const result = service.confirmQuote({ userId: userId("bob"), quoteId: quote.id });

      expect(result).toEqual({ status: "expired" });
      expect(storedConfirmedAt(quote.id)).toBeNull();
      expect(quoteRowCount()).toBe(1);
      expect(service.listHistory(userId("bob"))).toEqual([]);
    });

    it("rejects a quote that expires between fetching it and confirming it", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);

      const fetched = quoteRepository.findById(quote.id);
      if (!fetched) throw new Error("expected the quote to be stored");
      expect(isExpired(fetched, now)).toBe(false);

      advanceClock(QUOTE_TTL_MS + 1);
      const result = service.confirmQuote({ userId: userId("bob"), quoteId: quote.id });

      expect(result).toEqual({ status: "expired" });
      expect(storedConfirmedAt(quote.id)).toBeNull();
    });

    it("rejects another user's quote without confirming it or revealing its contents", async () => {
      const service = buildService();
      const quote = await referenceQuote(service, "alice");

      const result = service.confirmQuote({ userId: userId("bob"), quoteId: quote.id });

      expect(result).toEqual({ status: "not_owner" });
      expect(storedConfirmedAt(quote.id)).toBeNull();
      expect(service.listHistory(userId("bob"))).toEqual([]);
    });

    it("reports a non-existent or malformed quote id as not found", () => {
      const service = buildService();

      for (const quoteId of [9999, 0, -1, 1.5, Number.NaN]) {
        expect(service.confirmQuote({ userId: userId("bob"), quoteId })).toEqual({
          status: "not_found",
        });
      }
    });

    it("never throws on a rejection path, returning a typed result instead", async () => {
      const service = buildService();
      const confirmed = await referenceQuote(service);
      service.confirmQuote({ userId: userId("bob"), quoteId: confirmed.id });
      const expiring = await referenceQuote(service);
      const alices = await referenceQuote(service, "alice");
      advanceClock(QUOTE_TTL_MS + 1);

      const rejections = [
        { request: { userId: userId("bob"), quoteId: confirmed.id }, status: "already_confirmed" },
        { request: { userId: userId("bob"), quoteId: expiring.id }, status: "expired" },
        { request: { userId: userId("bob"), quoteId: alices.id }, status: "not_owner" },
        { request: { userId: userId("bob"), quoteId: 9999 }, status: "not_found" },
      ];

      for (const { request, status } of rejections) {
        expect(() => service.confirmQuote(request)).not.toThrow();
        expect(service.confirmQuote(request).status).toBe(status);
      }
    });
  });

  describe("listHistory", () => {
    it("reports a confirmed quote to its owner with the amounts it was quoted at", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);
      advanceClock(2_000);
      service.confirmQuote({ userId: userId("bob"), quoteId: quote.id });

      const history = service.listHistory(userId("bob"));

      expect(history).toHaveLength(1);
      const [entry] = history;
      expect(entry).toEqual(
        expect.objectContaining({
          id: quote.id,
          destinationCurrency: "MXN",
          createdAt: quote.createdAt,
          confirmedAt: now,
        }),
      );
      // The reference case read back out of its integer columns: 100 MXN, 0.314375 BRL per MXN
      // (so 0.00314375 per centavo), R$31.44.
      expect(entry.quantity.toString()).toBe("100");
      expect(entry.unitPrice.toString()).toBe("0.00314375");
      expect(entry.totalPrice.toString()).toBe("31.44");
    });

    it("never shows a confirmed quote to another user", async () => {
      const service = buildService();
      const quote = await referenceQuote(service);
      service.confirmQuote({ userId: userId("bob"), quoteId: quote.id });

      expect(service.listHistory(userId("alice"))).toEqual([]);
      expect(service.listHistory(userId("carol"))).toEqual([]);
    });

    it("lists the most recently confirmed first, leaving out unconfirmed and expired quotes", async () => {
      const service = buildService();
      const confirmedLater = await referenceQuote(service);
      advanceClock(1_000);
      const confirmedEarlier = await referenceQuote(service);
      const neverConfirmed = await referenceQuote(service);
      const expiredUnconfirmed = await referenceQuote(service);

      advanceClock(1_000);
      service.confirmQuote({ userId: userId("bob"), quoteId: confirmedEarlier.id });
      advanceClock(1_000);
      service.confirmQuote({ userId: userId("bob"), quoteId: confirmedLater.id });
      advanceClock(QUOTE_TTL_MS);
      expect(
        service.confirmQuote({ userId: userId("bob"), quoteId: expiredUnconfirmed.id }).status,
      ).toBe("expired");

      const ids = service.listHistory(userId("bob")).map((entry) => entry.id);

      expect(ids).toEqual([confirmedLater.id, confirmedEarlier.id]);
      expect(ids).not.toContain(neverConfirmed.id);
      expect(ids).not.toContain(expiredUnconfirmed.id);
    });

    it("returns an empty list for a user with no confirmed quotes", async () => {
      const service = buildService();
      await referenceQuote(service);

      expect(service.listHistory(userId("bob"))).toEqual([]);
      expect(service.listHistory(9999)).toEqual([]);
    });
  });
});
