import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { ComposedPrice } from "./ComposedPrice";
import { ceilToCentavos, MAX_EXACT_COUNT, spreadMultiplierFromBasisPoints } from "./money";
import { maxQuantityMinorUnits, priceQuote } from "./pricing";

// The whole point of this unit is that it is pure, so every test here builds its inputs by hand.
// Nothing below opens a database, constructs an exchange client or reads a clock.
function composedPrice(usdtBrlAsk: string, usdtDestinationBid: string): ComposedPrice {
  return {
    destinationCurrency: "MXN",
    usdtBrlAsk: new Decimal(usdtBrlAsk),
    usdtBrlSource: "binance",
    destinationLeg: { listing: "direct", usdtDestinationBid: new Decimal(usdtDestinationBid) },
  };
}

/** Legs for a destination Binance lists only as `<destino>`/USDT, the way it lists EUR. */
function invertedComposedPrice(usdtBrlAsk: string, destinationUsdtAsk: string): ComposedPrice {
  return {
    destinationCurrency: "EUR",
    usdtBrlAsk: new Decimal(usdtBrlAsk),
    usdtBrlSource: "binance",
    destinationLeg: { listing: "inverted", destinationUsdtAsk: new Decimal(destinationUsdtAsk) },
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

  it("does not overcharge a total that is exactly a whole centavo after a non-terminating division", () => {
    // 5.00 / 18.7 × 1.01 × 11.22 is exactly R$3.03; rounding the division first charged R$3.04.
    const pricing = priceQuote({
      composedPrice: composedPrice("5.00", "18.7"),
      quantityMinorUnits: 1122,
      spreadBasisPoints: 100,
    });

    expect(pricing.totalPrice).toBe(303);
  });

  it("does not undercharge a total that lies just past a whole centavo", () => {
    // The exact total is a sliver above R$1,399,024.41; rounding the division first lost the
    // sliver and ceilinged to that figure instead of the next centavo.
    const pricing = priceQuote({
      composedPrice: composedPrice("5.00", "3920.12345678"),
      quantityMinorUnits: 109032771496,
      spreadBasisPoints: 60,
    });

    expect(pricing.totalPrice).toBe(139902442);
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

describe("priceQuote from an inverted <destino>/USDT pair", () => {
  const ONE_HUNDRED_EUR = 10000;

  it("prices the same trade as the direct pair it mirrors", () => {
    // Buying EUR at a EUR/USDT ask of 1.25 spends as much USDT per euro as selling USDT at a
    // USDT/EUR bid of 0.80, so 100 EUR costs 5.00 × 1.25 × 1.006 × 100 = R$628.75 either way.
    const request = { quantityMinorUnits: ONE_HUNDRED_EUR, spreadBasisPoints: 60 };

    const inverted = priceQuote({
      ...request,
      composedPrice: invertedComposedPrice("5.00", "1.25"),
    });
    const direct = priceQuote({ ...request, composedPrice: composedPrice("5.00", "0.80") });

    expect(inverted).toEqual({ unitPrice: 6287500, totalPrice: 62875 });
    expect(direct).toEqual(inverted);
  });

  it("multiplies by the ask instead of dividing by a rounded reciprocal of it", () => {
    // 5.00 × 1.17 × 1.006 × 100 is exactly R$588.51. 1 / 1.17 never terminates, so a USDT/EUR bid
    // derived from the ask is rounded to 20 digits and leaves the total a sliver above: R$588.52.
    const request = { quantityMinorUnits: ONE_HUNDRED_EUR, spreadBasisPoints: 60 };
    const reciprocalBid = new Decimal(1).dividedBy("1.17").toString();

    expect(
      priceQuote({ ...request, composedPrice: composedPrice("5.00", reciprocalBid) }).totalPrice,
    ).toBe(58852);
    expect(
      priceQuote({ ...request, composedPrice: invertedComposedPrice("5.00", "1.17") }).totalPrice,
    ).toBe(58851);
  });

  it("rejects an ask that is not a positive price", () => {
    expect(() =>
      priceQuote({
        composedPrice: invertedComposedPrice("5.00", "0"),
        quantityMinorUnits: ONE_HUNDRED_EUR,
        spreadBasisPoints: 60,
      }),
    ).toThrow(RangeError);
  });
});

describe("maxQuantityMinorUnits", () => {
  it("bounds an expensive currency by what the total can hold, exactly at the edge", () => {
    // 5.00 / 0.90 × 1.006 BRL per unit is ~5.59 centavos per minor unit, so the total runs out of
    // exact integers well before the quantity does.
    const input = { composedPrice: composedPrice("5.00", "0.90"), spreadBasisPoints: 60 };

    const max = maxQuantityMinorUnits(input);

    expect(max).toBe(1611626109198189);
    expect(priceQuote({ ...input, quantityMinorUnits: max }).totalPrice).toBe(9007199254740990);
    expect(() => priceQuote({ ...input, quantityMinorUnits: max + 1 })).toThrow(RangeError);
  });

  it("bounds a centavo-cheap currency by what the quantity can hold", () => {
    // At ~0.005 BRL per unit the total stays far smaller than the quantity.
    expect(
      maxQuantityMinorUnits({
        composedPrice: composedPrice("5.00", "1010.00"),
        spreadBasisPoints: 60,
      }),
    ).toBe(MAX_EXACT_COUNT);
  });

  it("rejects a rate at which not even one minor unit could be stored", () => {
    expect(() =>
      maxQuantityMinorUnits({
        composedPrice: composedPrice("5.00", "0.000000000000000001"),
        spreadBasisPoints: 60,
      }),
    ).toThrow(RangeError);
  });
});
