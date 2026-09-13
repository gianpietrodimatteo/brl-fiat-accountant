import type Decimal from "decimal.js";

/** Which exchange won the USDT/BRL leg, per [[business]]'s "cheaper for the client" rule. */
export type BrlLegSource = "binance" | "okx";

/**
 * The USDT → destination leg, in the order Binance lists the pair. Either way it is the same
 * trade — the client gives up USDT and receives destination currency — priced on the side
 * [[business]] assigns to it:
 * - `direct`, USDT/`<destino>`: the client sells USDT, so it receives the bid.
 * - `inverted`, `<destino>`/USDT (Binance lists EUR only as EUR/USDT): the client buys the
 *   destination currency, so it pays the ask.
 *
 * The inverted ask is carried as quoted instead of being turned into a USDT/`<destino>` bid:
 * 1 / ask rarely terminates, so that bid could only reach pricing already rounded.
 */
export type DestinationLeg =
  | {
      listing: "direct";
      /** Destination units received per USDT. */
      usdtDestinationBid: Decimal;
    }
  | {
      listing: "inverted";
      /** USDT paid per destination unit. */
      destinationUsdtAsk: Decimal;
    };

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
  /** How the client turns that USDT into the destination currency. Always Binance. */
  destinationLeg: DestinationLeg;
}

/**
 * Composition either produces both legs or it produces no quote capability at all — a typed
 * outcome, never an exception and never a partial price.
 */
export type ComposedPriceResult =
  ({ status: "available" } & ComposedPrice) | { status: "no_quote_capability"; reason: string };
