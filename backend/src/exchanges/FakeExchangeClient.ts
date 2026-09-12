import Decimal from "decimal.js";
import type { ExchangeClient, TopOfBookResult } from "./ExchangeClient";

/** Prices keyed by `BASE/QUOTE`; an `unavailable` entry stands in for an exchange outage. */
export type FakePriceTable = Record<string, TopOfBookResult>;

export function fakePairKey(baseAsset: string, quoteAsset: string): string {
  return `${baseAsset}/${quoteAsset}`;
}

/** Builds a top of book from decimal strings, so callers never spell out `new Decimal`. */
export function fakePrice(bid: string, ask: string): TopOfBookResult {
  return { status: "available", bid: new Decimal(bid), ask: new Decimal(ask) };
}

/** The table form of `fakePrice`, for a fake that serves more than one pair. */
export function fakePrices(entries: Record<string, { bid: string; ask: string }>): FakePriceTable {
  const table: FakePriceTable = {};
  for (const [pair, { bid, ask }] of Object.entries(entries)) {
    table[pair] = fakePrice(bid, ask);
  }
  return table;
}

/** The other half of a price table entry: a pair this fake exchange can't currently serve. */
export function fakeUnavailable(reason: string): TopOfBookResult {
  return { status: "unavailable", reason };
}

/**
 * Shared behaviour of the Simulated Mode fakes. Every price is read from an in-memory table:
 * there is no `fetch`, no WebSocket and no timer anywhere in this hierarchy, so a fake cannot
 * touch the network by construction.
 *
 * Defaults are fixed and plausible, and a subclass's constructor takes overrides so consumers
 * of `ExchangeClient` (pricing, quote lifecycle, routes) can reuse these fakes for specific
 * prices and outages instead of building a second mocking layer — see `.claude/rules/backend.md`.
 */
export abstract class FakeExchangeClient implements ExchangeClient {
  /** Every pair asked for, in order — lets consumers assert which legs were requested. */
  readonly requestedPairs: string[] = [];

  private readonly prices: FakePriceTable;

  constructor(defaults: FakePriceTable, overrides: FakePriceTable = {}) {
    this.prices = { ...defaults, ...overrides };
  }

  getTopOfBook(baseAsset: string, quoteAsset: string): Promise<TopOfBookResult> {
    const pair = fakePairKey(baseAsset, quoteAsset);
    this.requestedPairs.push(pair);

    return Promise.resolve(this.prices[pair] ?? fakeUnavailable(this.unavailableReason(pair)));
  }

  /** Phrased by each fake to match what the real client says about a pair it can't serve. */
  protected abstract unavailableReason(pair: string): string;
}
