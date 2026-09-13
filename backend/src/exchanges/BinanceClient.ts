import Decimal from "decimal.js";
import { CoalescingCache } from "./CoalescingCache";
import type { ExchangeClient, TopOfBookResult } from "./ExchangeClient";

const DEFAULT_BASE_URL = "https://api.binance.com";
const DEFAULT_TIMEOUT_MS = 5000;
// Trading pairs don't change between requests, so a resolved symbol map can be cached far
// longer than prices.
const EXCHANGE_INFO_TTL_MS = 10 * 60 * 1000;
// Bounds the live bid/ask request rate to at most one Binance call per symbol per second,
// regardless of caller volume, per the rate-limit strategy in DECISIONS.md.
const BOOK_TICKER_TTL_MS = 1000;
// A failed lookup gets the same short bound rather than the long one: concurrent callers
// during an outage still collapse into a single request, but a transient failure can't
// lock quoting out for a full EXCHANGE_INFO_TTL_MS after Binance recovers.
const UNAVAILABLE_TTL_MS = 1000;

const EXCHANGE_INFO_CACHE_KEY = "exchangeInfo";

/** A Binance symbol and its trading status as exchangeInfo reported it, e.g. TRADING or BREAK. */
interface ListedSymbol {
  symbol: string;
  status: string;
}

type SymbolResolution =
  | { status: "available"; symbolsByPair: Map<string, ListedSymbol> }
  | { status: "unavailable"; reason: string };

export class BinanceClient implements ExchangeClient {
  private readonly symbolCache = new CoalescingCache<SymbolResolution>((resolution) =>
    resolution.status === "available" ? EXCHANGE_INFO_TTL_MS : UNAVAILABLE_TTL_MS,
  );
  private readonly bookTickerCache = new CoalescingCache<TopOfBookResult>(BOOK_TICKER_TTL_MS);

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async getTopOfBook(baseAsset: string, quoteAsset: string): Promise<TopOfBookResult> {
    const resolution = await this.symbolCache.get(EXCHANGE_INFO_CACHE_KEY, () =>
      this.resolveSymbols(),
    );
    if (resolution.status === "unavailable") {
      return { status: "unavailable", reason: resolution.reason };
    }

    // Only the exact order is matched. Binance lists some pairs one way round only (EUR/USDT,
    // never USDT/EUR), and the order decides which side of the book a caller trades on, so
    // asking for the other one is the caller's decision rather than a lookup detail.
    const listed = resolution.symbolsByPair.get(pairKey(baseAsset, quoteAsset));
    if (!listed) {
      return {
        status: "unlisted",
        reason: `No Binance trading pair found for ${baseAsset}/${quoteAsset}`,
      };
    }
    // A halted pair is still listed: that is an outage, so it must not read as unlisted and send
    // a caller to the other order.
    if (listed.status !== "TRADING") {
      return {
        status: "unavailable",
        reason: `Binance ${listed.symbol} is not trading (status ${listed.status})`,
      };
    }

    const { symbol } = listed;
    return this.bookTickerCache.get(symbol, () => this.fetchBookTicker(symbol));
  }

  private async resolveSymbols(): Promise<SymbolResolution> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/v3/exchangeInfo`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        return {
          status: "unavailable",
          reason: `Binance exchangeInfo returned HTTP ${response.status}`,
        };
      }

      const data: unknown = await response.json();
      const symbolsByPair = parseExchangeInfo(data);
      return { status: "available", symbolsByPair };
    } catch (error) {
      return {
        status: "unavailable",
        reason: `Binance exchangeInfo request failed: ${describeError(error)}`,
      };
    }
  }

  private async fetchBookTicker(symbol: string): Promise<TopOfBookResult> {
    try {
      const url = `${this.baseUrl}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`;
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) {
        return {
          status: "unavailable",
          reason: `Binance bookTicker returned HTTP ${response.status}`,
        };
      }

      const data: unknown = await response.json();
      return parseBookTicker(data);
    } catch (error) {
      return {
        status: "unavailable",
        reason: `Binance bookTicker request failed: ${describeError(error)}`,
      };
    }
  }
}

function pairKey(baseAsset: string, quoteAsset: string): string {
  return `${baseAsset}/${quoteAsset}`;
}

function parseExchangeInfo(data: unknown): Map<string, ListedSymbol> {
  const symbolsByPair = new Map<string, ListedSymbol>();
  if (!isRecord(data) || !Array.isArray(data.symbols)) {
    throw new Error("malformed exchangeInfo response: missing symbols array");
  }

  for (const entry of data.symbols) {
    if (
      isRecord(entry) &&
      typeof entry.symbol === "string" &&
      typeof entry.baseAsset === "string" &&
      typeof entry.quoteAsset === "string" &&
      typeof entry.status === "string"
    ) {
      symbolsByPair.set(pairKey(entry.baseAsset, entry.quoteAsset), {
        symbol: entry.symbol,
        status: entry.status,
      });
    }
  }

  return symbolsByPair;
}

function parseBookTicker(data: unknown): TopOfBookResult {
  if (!isRecord(data) || typeof data.bidPrice !== "string" || typeof data.askPrice !== "string") {
    return { status: "unavailable", reason: "malformed Binance bookTicker response" };
  }

  try {
    const bid = new Decimal(data.bidPrice);
    const ask = new Decimal(data.askPrice);
    if (!bid.isFinite() || !ask.isFinite() || bid.isNegative() || ask.isNegative()) {
      return { status: "unavailable", reason: "malformed Binance bookTicker response" };
    }
    return { status: "available", bid, ask };
  } catch {
    return { status: "unavailable", reason: "malformed Binance bookTicker response" };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
