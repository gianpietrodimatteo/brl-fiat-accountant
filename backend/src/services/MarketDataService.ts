import type Decimal from "decimal.js";
import type { ComposedPriceResult } from "../domain/ComposedPrice";
import type { ExchangeClient, TopOfBookResult } from "../exchanges/ExchangeClient";

/** Bridge asset every quote routes through, per [[business]]. */
const BRIDGE_ASSET = "USDT";
const LOCAL_CURRENCY = "BRL";

/**
 * Composes the two legs a quote is built from, so pricing never has to know that Binance and
 * OKX exist.
 *
 * Availability follows [[business]]: Binance is the deciding exchange, so any Binance leg it
 * can't serve means no quote capability at all — a typed result, never an exception and never
 * a partial price. OKX only ever improves the BRL leg; when it is unavailable the BRL leg
 * falls back to Binance alone.
 */
export class MarketDataService {
  constructor(
    private readonly binanceClient: ExchangeClient,
    private readonly okxClient: ExchangeClient,
  ) {}

  async getComposedPrice(destinationCurrency: string): Promise<ComposedPriceResult> {
    // OKX answers from memory and Binance coalesces concurrent lookups, so asking for all
    // three at once costs no extra Binance requests.
    const [binanceBrl, destination, okxBrl] = await Promise.all([
      topOfBook(this.binanceClient, BRIDGE_ASSET, LOCAL_CURRENCY),
      topOfBook(this.binanceClient, BRIDGE_ASSET, destinationCurrency),
      topOfBook(this.okxClient, BRIDGE_ASSET, LOCAL_CURRENCY),
    ]);

    // The clients only reject malformed or negative prices, so a zero can still arrive: that is
    // how Binance reports an empty side of the book (OKX's empty string is read as zero too),
    // not a free one. Each leg is checked on the side it is actually priced from.
    if (binanceBrl.status === "unavailable") {
      return noQuoteCapability(BRIDGE_ASSET, LOCAL_CURRENCY, binanceBrl.reason);
    }
    if (!isUsablePrice(binanceBrl.ask)) {
      return noQuoteCapability(BRIDGE_ASSET, LOCAL_CURRENCY, unusablePrice("ask", binanceBrl.ask));
    }
    if (destination.status === "unavailable") {
      return noQuoteCapability(BRIDGE_ASSET, destinationCurrency, destination.reason);
    }
    if (!isUsablePrice(destination.bid)) {
      return noQuoteCapability(
        BRIDGE_ASSET,
        destinationCurrency,
        unusablePrice("bid", destination.bid),
      );
    }

    // Cheaper for the client means paying fewer BRL per USDT. A tie keeps Binance, so the
    // composed price stays deterministic. An unusable OKX ask is just an unavailable OKX.
    const okxIsCheaper =
      okxBrl.status === "available" &&
      isUsablePrice(okxBrl.ask) &&
      okxBrl.ask.lessThan(binanceBrl.ask);

    return {
      status: "available",
      destinationCurrency,
      usdtBrlAsk: okxIsCheaper ? okxBrl.ask : binanceBrl.ask,
      usdtBrlSource: okxIsCheaper ? "okx" : "binance",
      usdtDestinationBid: destination.bid,
    };
  }
}

function noQuoteCapability(
  baseAsset: string,
  quoteAsset: string,
  reason: string,
): ComposedPriceResult {
  return {
    status: "no_quote_capability",
    reason: `Binance ${baseAsset}/${quoteAsset} unavailable: ${reason}`,
  };
}

function isUsablePrice(price: Decimal): boolean {
  return price.isFinite() && price.greaterThan(0);
}

function unusablePrice(side: "bid" | "ask", price: Decimal): string {
  return `no usable ${side} (got ${price.toString()})`;
}

/**
 * The clients already turn network failures into typed results, but this service must hold
 * that guarantee for whatever implementation is injected — including the Simulated Mode fakes
 * and test stubs — so a rejected promise is treated as one more unavailable exchange.
 */
async function topOfBook(
  client: ExchangeClient,
  baseAsset: string,
  quoteAsset: string,
): Promise<TopOfBookResult> {
  try {
    return await client.getTopOfBook(baseAsset, quoteAsset);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { status: "unavailable", reason: `price lookup threw: ${detail}` };
  }
}
