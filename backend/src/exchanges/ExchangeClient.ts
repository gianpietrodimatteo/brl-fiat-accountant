import type Decimal from "decimal.js";

export interface TopOfBook {
  bid: Decimal;
  ask: Decimal;
}

/**
 * `unlisted` means the exchange has no instrument at all for that exact base/quote order — a fact
 * about its listings, not an outage — so a caller may ask for the pair the other way round.
 * `unavailable` is every other reason a price didn't arrive, including a listed instrument that is
 * halted (not trading), and is never worth retrying inverted.
 */
export type TopOfBookResult =
  | ({ status: "available" } & TopOfBook)
  | { status: "unavailable"; reason: string }
  | { status: "unlisted"; reason: string };

/**
 * Shared shape for exchange price sources (Binance, OKX, and the Simulated Mode fakes).
 * Callers ask for a base/quote asset pair and never see exchange-specific response shapes
 * or raw network errors — failures surface as `{ status: 'unavailable' }`, and a pair the
 * exchange doesn't list in that order as `{ status: 'unlisted' }`.
 */
export interface ExchangeClient {
  getTopOfBook(baseAsset: string, quoteAsset: string): Promise<TopOfBookResult>;
}
