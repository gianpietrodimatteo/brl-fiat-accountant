import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BinanceClient } from "./BinanceClient";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

const EXCHANGE_INFO_BODY = {
  symbols: [
    { symbol: "USDTBRL", baseAsset: "USDT", quoteAsset: "BRL", status: "TRADING" },
    { symbol: "USDTMXN", baseAsset: "USDT", quoteAsset: "MXN", status: "TRADING" },
    { symbol: "USDTEUR", baseAsset: "USDT", quoteAsset: "EUR", status: "BREAK" },
    { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", status: "TRADING" },
  ],
};

function bookTickerBody(symbol: string, bidPrice: string, askPrice: string) {
  return { symbol, bidPrice, bidQty: "10", askPrice, askQty: "10" };
}

function fakeFetch(handlers: {
  exchangeInfo?: () => Response | Promise<Response>;
  bookTicker?: (symbol: string) => Response | Promise<Response>;
}) {
  return vi.fn(async (url: string | URL) => {
    const href = url.toString();
    if (href.includes("/exchangeInfo")) {
      return handlers.exchangeInfo ? handlers.exchangeInfo() : jsonResponse(EXCHANGE_INFO_BODY);
    }
    if (href.includes("/ticker/bookTicker")) {
      const symbol = new URL(href).searchParams.get("symbol") ?? "";
      return handlers.bookTicker
        ? handlers.bookTicker(symbol)
        : jsonResponse(bookTickerBody(symbol, "5.00000000", "5.01000000"));
    }
    throw new Error(`unexpected URL: ${href}`);
  }) as unknown as typeof fetch;
}

describe("BinanceClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves the USDT/BRL pair via exchangeInfo and fetches its bid/ask", async () => {
    const fetchFn = fakeFetch({
      bookTicker: (symbol) => jsonResponse(bookTickerBody(symbol, "5.00", "5.02")),
    });
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.bid.toString()).toBe("5");
      expect(result.ask.toString()).toBe("5.02");
    }
    const bookTickerCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find(([url]) =>
      url.toString().includes("bookTicker"),
    );
    expect(bookTickerCall?.[0].toString()).toContain("symbol=USDTBRL");
  });

  it("resolves the USDT/<destination> pair for a non-BRL currency", async () => {
    const fetchFn = fakeFetch({});
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "MXN");

    expect(result.status).toBe("available");
  });

  it("does not hardcode pair strings: an unresolvable pair is reported unavailable, not thrown", async () => {
    const fetchFn = fakeFetch({});
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "JPY");

    expect(result).toEqual({
      status: "unavailable",
      reason: expect.stringContaining("USDT/JPY"),
    });
  });

  it("ignores a pair whose status is not TRADING", async () => {
    const fetchFn = fakeFetch({});
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "EUR");

    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable, not a thrown exception, on a network failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const client = new BinanceClient(fetchFn);

    await expect(client.getTopOfBook("USDT", "BRL")).resolves.toEqual({
      status: "unavailable",
      reason: expect.stringContaining("ECONNREFUSED"),
    });
  });

  it("returns unavailable on a timeout (abort) from the fetch layer", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    const fetchFn = vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch;
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable on a non-OK HTTP status", async () => {
    const fetchFn = fakeFetch({
      exchangeInfo: () => jsonResponse({}, { ok: false, status: 503 }),
    });
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result).toEqual({
      status: "unavailable",
      reason: expect.stringContaining("503"),
    });
  });

  it("returns unavailable on a malformed exchangeInfo response", async () => {
    const fetchFn = fakeFetch({ exchangeInfo: () => jsonResponse({ oops: true }) });
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable on a malformed bookTicker response", async () => {
    const fetchFn = fakeFetch({ bookTicker: () => jsonResponse({ bidPrice: "not-a-number" }) });
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result.status).toBe("unavailable");
  });

  it("bounds the request rate: hundreds of concurrent callers yield one exchangeInfo call and one bookTicker call", async () => {
    const fetchFn = fakeFetch({});
    const client = new BinanceClient(fetchFn);

    const results = await Promise.all(
      Array.from({ length: 300 }, () => client.getTopOfBook("USDT", "BRL")),
    );

    expect(results.every((r) => r.status === "available")).toBe(true);
    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls;
    const exchangeInfoCalls = calls.filter(([url]) => url.toString().includes("exchangeInfo"));
    const bookTickerCalls = calls.filter(([url]) => url.toString().includes("bookTicker"));
    expect(exchangeInfoCalls).toHaveLength(1);
    expect(bookTickerCalls).toHaveLength(1);
  });

  it("bounds the request rate across mixed concurrent pairs to one bookTicker call per symbol", async () => {
    const fetchFn = fakeFetch({});
    const client = new BinanceClient(fetchFn);

    await Promise.all([
      ...Array.from({ length: 100 }, () => client.getTopOfBook("USDT", "BRL")),
      ...Array.from({ length: 100 }, () => client.getTopOfBook("USDT", "MXN")),
    ]);

    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls;
    const exchangeInfoCalls = calls.filter(([url]) => url.toString().includes("exchangeInfo"));
    const bookTickerCalls = calls.filter(([url]) => url.toString().includes("bookTicker"));
    expect(exchangeInfoCalls).toHaveLength(1);
    expect(bookTickerCalls).toHaveLength(2);
  });

  it("returns unavailable when the response body is not JSON at all", async () => {
    const fetchFn = fakeFetch({
      exchangeInfo: () =>
        ({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON")),
        }) as Response,
    });
    const client = new BinanceClient(fetchFn);

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result.status).toBe("unavailable");
  });

  it("bounds the request rate while Binance is down: concurrent callers share one failed lookup", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const client = new BinanceClient(fetchFn);

    const results = await Promise.all(
      Array.from({ length: 300 }, () => client.getTopOfBook("USDT", "BRL")),
    );

    expect(results.every((r) => r.status === "unavailable")).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("retries pair resolution shortly after a failure instead of caching it for the long TTL", async () => {
    const exchangeInfo = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error("ECONNREFUSED")))
      .mockImplementation(() => jsonResponse(EXCHANGE_INFO_BODY));
    const fetchFn = fakeFetch({ exchangeInfo });
    const client = new BinanceClient(fetchFn);

    const duringOutage = await client.getTopOfBook("USDT", "BRL");
    expect(duringOutage.status).toBe("unavailable");

    vi.advanceTimersByTime(1001);
    const afterRecovery = await client.getTopOfBook("USDT", "BRL");

    expect(afterRecovery.status).toBe("available");
    expect(exchangeInfo).toHaveBeenCalledTimes(2);
  });

  it("re-resolves symbols only after the long exchangeInfo TTL", async () => {
    const fetchFn = fakeFetch({});
    const client = new BinanceClient(fetchFn);

    await client.getTopOfBook("USDT", "BRL");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await client.getTopOfBook("USDT", "BRL");

    const exchangeInfoCalls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
      url.toString().includes("exchangeInfo"),
    );
    expect(exchangeInfoCalls).toHaveLength(2);
  });

  it("refetches bid/ask after the short TTL expires, without re-resolving the symbol", async () => {
    const fetchFn = fakeFetch({});
    const client = new BinanceClient(fetchFn);

    await client.getTopOfBook("USDT", "BRL");
    vi.advanceTimersByTime(1001);
    await client.getTopOfBook("USDT", "BRL");

    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls;
    const exchangeInfoCalls = calls.filter(([url]) => url.toString().includes("exchangeInfo"));
    const bookTickerCalls = calls.filter(([url]) => url.toString().includes("bookTicker"));
    expect(exchangeInfoCalls).toHaveLength(1);
    expect(bookTickerCalls).toHaveLength(2);
  });
});
