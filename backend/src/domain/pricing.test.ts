import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { ComposedPrice } from "./ComposedPrice";
import { ceilToCentavos, spreadMultiplierFromBasisPoints } from "./money";
import { priceQuote } from "./pricing";

// The whole point of this unit is that it is pure, so every test here builds its inputs by hand.
// Nothing below opens a database, constructs an exchange client or reads a clock.
function composedPrice(usdtBrlAsk: string, usdtDestinationBid: string): ComposedPrice {
  return {
    destinationCurrency: "MXN",
    usdtBrlAsk: new Decimal(usdtBrlAsk),
    usdtBrlSource: "binance",
    usdtDestinationBid: new Decimal(usdtDestinationBid),
  };
}

/** 100 MXN, the quantity [[business]]'s reference check is stated in. */
const ONE_HUNDRED_MXN = 10000;

describe("priceQuote", () => {
  it("reproduces the business reference check", () => {
    // USDT/BRL ask 5.00, USDT/MXN bid 16.00, spread 0.6% → 100 MXN costs R$31.44.
    const pricing = priceQuote({
      composedPrice: composedPrice("5.00", "16.00"),
      quantityMinorUnits: ONE_HUNDRED_MXN,
      spreadBasisPoints: 60,
    });

    expect(pricing.totalPrice).toBe(3144);
  });

  it("returns the spread-applied rate as the unit price for the reference case", () => {
    // 0.3125 BRL per MXN with the 0.6% spread is 0.314375, so one MXN centavo costs
    // 0.00314375 BRL — 314375 sub-units at the 10^8 scale.
    const pricing = priceQuote({
      composedPrice: composedPrice("5.00", "16.00"),
      quantityMinorUnits: ONE_HUNDRED_MXN,
      spreadBasisPoints: 60,
    });

    expect(pricing.unitPrice).toBe(314375);
  });

  it("applies the user's own spread to the same legs", () => {
    const legs = composedPrice("5.00", "16.00");

    expect(
      priceQuote({ composedPrice: legs, quantityMinorUnits: ONE_HUNDRED_MXN, spreadBasisPoints: 0 })
        .totalPrice,
    ).toBe(3125);
    expect(
      priceQuote({
        composedPrice: legs,
        quantityMinorUnits: ONE_HUNDRED_MXN,
        spreadBasisPoints: 100,
      }).totalPrice,
      // 31.5625 ceilings to R$31.57.
    ).toBe(3157);
  });

  it("does not inflate a total that already lands on a whole centavo", () => {
    // 5.00 / 16.00 × 100 is exactly 31.25, so the ceiling must leave it alone.
    const pricing = priceQuote({
      composedPrice: composedPrice("5.00", "16.00"),
      quantityMinorUnits: ONE_HUNDRED_MXN,
      spreadBasisPoints: 0,
    });

    expect(pricing.totalPrice).toBe(3125);
  });

  it("rounds the total once instead of rounding per unit first", () => {
    const input = {
      composedPrice: composedPrice("5.00", "16.00"),
      quantityMinorUnits: ONE_HUNDRED_MXN,
      spreadBasisPoints: 60,
    };
    // Ceiling the per-unit rate of 0.314375 BRL/MXN to a whole centavo gives 0.32, which over
    // 100 MXN would charge R$32.00 — R$0.56 more than the reference check allows.
    const perUnitRoundingFirst = ceilToCentavos(
      new Decimal("5.00").dividedBy("16.00").times(spreadMultiplierFromBasisPoints(60)),
    );

    const pricing = priceQuote(input);

    expect(perUnitRoundingFirst * 100).toBe(3200);
    expect(pricing.totalPrice).toBe(3144);
  });

  it("prices a non-terminating division without throwing", () => {
    // 5.00 / 3.00 repeats forever, so the chain has to stay decimal all the way to the ceiling.
    const pricing = priceQuote({
      composedPrice: composedPrice("5.00", "3.00"),
      quantityMinorUnits: ONE_HUNDRED_MXN,
      spreadBasisPoints: 0,
    });

    expect(pricing.totalPrice).toBe(16667);
    expect(pricing.unitPrice).toBe(1666667);
  });

  it("does not gain a spurious centavo from floating-point drift", () => {
    // In IEEE-754 this chain is 11000.000000000002, which would ceiling to R$110.01.
    expect(1.1 * 100 * 100).toBeGreaterThan(11000);

    const pricing = priceQuote({
      composedPrice: composedPrice("1.10", "1.00"),
      quantityMinorUnits: ONE_HUNDRED_MXN,
      spreadBasisPoints: 0,
    });

    expect(pricing.totalPrice).toBe(11000);
  });

  it("scales with the quantity rather than assuming the reference 100 units", () => {
    const legs = composedPrice("5.00", "16.00");

    // One MXN centavo at the reference rate is 0.00314375 BRL, which ceilings to one centavo.
    expect(
      priceQuote({ composedPrice: legs, quantityMinorUnits: 1, spreadBasisPoints: 60 }).totalPrice,
    ).toBe(1);
    expect(
      priceQuote({ composedPrice: legs, quantityMinorUnits: 100000, spreadBasisPoints: 60 })
        .totalPrice,
    ).toBe(31438);
  });

  it("rejects a leg that cannot be divided by", () => {
    expect(() =>
      priceQuote({
        composedPrice: composedPrice("5.00", "0"),
        quantityMinorUnits: ONE_HUNDRED_MXN,
        spreadBasisPoints: 60,
      }),
    ).toThrow(RangeError);
    expect(() =>
      priceQuote({
        composedPrice: composedPrice("0", "16.00"),
        quantityMinorUnits: ONE_HUNDRED_MXN,
        spreadBasisPoints: 60,
      }),
    ).toThrow(RangeError);
  });

  it("rejects a quantity that is not a whole minor-unit count", () => {
    expect(() =>
      priceQuote({
        composedPrice: composedPrice("5.00", "16.00"),
        quantityMinorUnits: 100.5,
        spreadBasisPoints: 60,
      }),
    ).toThrow(RangeError);
  });
});
