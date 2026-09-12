import type Decimal from "decimal.js";
import type { ComposedPrice } from "../services/MarketDataService";
import {
  ceilToCentavos,
  ceilToUnitPriceSubUnits,
  destinationUnitsFromMinorUnits,
  spreadMultiplierFromBasisPoints,
} from "./money";

/**
 * The one place that turns composed market legs plus a user's spread into the amounts a quote
 * row stores.
 *
 * It is deliberately pure: no database, no exchange client, no clock. The legs arrive already
 * composed from `MarketDataService`, the spread arrives already looked up, and what comes back
 * is nothing but the two integer columns.
 */

export interface QuotePricingInput {
  /** The two legs from `MarketDataService`, already resolved to the best available prices. */
  composedPrice: ComposedPrice;
  /** What the client asked to buy, in destination-currency minor units (100 MXN is 10000). */
  quantityMinorUnits: number;
  /** The quoting user's own spread, in basis points (0.6% is 60). */
  spreadBasisPoints: number;
}

export interface QuotePricing {
  /** `quotes.unit_price`: BRL sub-units at 10^8 per destination minor unit. */
  unitPrice: number;
  /** `quotes.total_price`: BRL centavos. */
  totalPrice: number;
}

/**
 * Prices a quote following [[business]] in order: the client buys USDT with BRL at the USDT/BRL
 * ask and sells it for the destination currency at the USDT/`<destino>` bid, so BRL per
 * destination unit is the ask divided by the bid; the user's spread goes on top of that composed
 * cost; the total is that rate times the quantity.
 *
 * Rounding happens exactly once, on the total. Ceiling the per-unit rate first and multiplying
 * afterwards would turn the reference check's R$31.44 into R$32.00, so `unitPrice` is a record
 * of the rate only and is never used to derive `totalPrice`.
 */
export function priceQuote({
  composedPrice,
  quantityMinorUnits,
  spreadBasisPoints,
}: QuotePricingInput): QuotePricing {
  const { usdtBrlAsk, usdtDestinationBid } = composedPrice;
  assertPositivePrice(usdtBrlAsk, "USDT/BRL ask");
  assertPositivePrice(usdtDestinationBid, `USDT/${composedPrice.destinationCurrency} bid`);

  const spreadMultiplier = spreadMultiplierFromBasisPoints(spreadBasisPoints);
  const brlPerDestinationUnit = usdtBrlAsk.dividedBy(usdtDestinationBid).times(spreadMultiplier);

  const quantityUnits = destinationUnitsFromMinorUnits(quantityMinorUnits);
  // One minor unit expressed in whole destination units — 0.01 for every supported currency.
  const oneMinorUnit = destinationUnitsFromMinorUnits(1);

  return {
    unitPrice: ceilToUnitPriceSubUnits(brlPerDestinationUnit.times(oneMinorUnit)),
    totalPrice: ceilToCentavos(brlPerDestinationUnit.times(quantityUnits)),
  };
}

function assertPositivePrice(price: Decimal, legName: string): void {
  if (!price.isFinite() || price.lessThanOrEqualTo(0)) {
    throw new RangeError(`${legName} must be a positive finite price, got ${price.toString()}`);
  }
}
