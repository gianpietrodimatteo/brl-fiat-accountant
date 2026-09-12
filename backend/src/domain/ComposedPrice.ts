import type Decimal from "decimal.js";

/** Which exchange won the USDT/BRL leg, per [[business]]'s "cheaper for the client" rule. */
export type BrlLegSource = "binance" | "okx";

/**
 * The two legs a quote is priced from, composed but not yet priced.
 *
 * This lives in the domain rather than alongside `MarketDataService` because it is the contract
 * between market data and pricing: the service produces it, `priceQuote` consumes it, and
 * neither side should have to know the other exists.
 */
export interface ComposedPrice {
  destinationCurrency: string;
  /**
   * BRL paid per USDT — the USDT/BRL ask, since the client buys USDT, taken from whichever
   * exchange is cheaper for the client.
   */
  usdtBrlAsk: Decimal;
  usdtBrlSource: BrlLegSource;
  /**
   * Destination units received per USDT — the USDT/`<destino>` bid, since the client sells
   * the USDT. Always Binance.
   */
  usdtDestinationBid: Decimal;
}

/**
 * Composition either produces both legs or it produces no quote capability at all — a typed
 * outcome, never an exception and never a partial price.
 */
export type ComposedPriceResult =
  ({ status: "available" } & ComposedPrice) | { status: "no_quote_capability"; reason: string };
