import type Decimal from "decimal.js";

export interface TopOfBook {
  bid: Decimal;
  ask: Decimal;
}

export type TopOfBookResult =
  ({ status: "available" } & TopOfBook) | { status: "unavailable"; reason: string };

/**
 * Shared shape for exchange price sources (Binance, OKX, and the Simulated Mode fakes).
 * Callers ask for a base/quote asset pair and never see exchange-specific response shapes
 * or raw network errors — failures surface as `{ status: 'unavailable' }`.
 */
export interface ExchangeClient {
  getTopOfBook(baseAsset: string, quoteAsset: string): Promise<TopOfBookResult>;
}
