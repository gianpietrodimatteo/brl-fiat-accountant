import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  brlFromCentavos,
  brlFromUnitPriceSubUnits,
  ceilToCentavos,
  ceilToUnitPriceSubUnits,
  destinationMinorUnitsFromUnits,
  destinationUnitsFromMinorUnits,
  ExactFraction,
  MAX_EXACT_COUNT,
  maxMinorUnitsWithinCentavos,
  spreadMultiplierFromBasisPoints,
} from "./money";

describe("MAX_EXACT_COUNT", () => {
  it("is the largest integer a JavaScript number holds exactly, not SQLite's 2^63 − 1", () => {
    expect(MAX_EXACT_COUNT).toBe(2 ** 53 - 1);
    // One past it, two different integers already read back as the same number.
    expect(MAX_EXACT_COUNT + 2).toBe(MAX_EXACT_COUNT + 1);
  });
});

describe("ExactFraction", () => {
  it("ceilings a chain that decimal.js would round onto the wrong side of a centavo", () => {
    // 5.00 / 18.7 × 1.01 × 11.22 is exactly 3.03. Rounding the division to 20 significant
    // digits first leaves it a hair above, which ceilings to 3.04.
    const rounded = new Decimal("5.00").dividedBy("18.7").times("1.01").times("11.22");
    const exact = ExactFraction.of(new Decimal("5.00"))
      .dividedBy(ExactFraction.of(new Decimal("18.7")))
      .times(ExactFraction.of(new Decimal("1.01")))
      .times(ExactFraction.of(new Decimal("11.22")));

    expect(ceilToCentavos(rounded)).toBe(304);
    expect(ceilToCentavos(exact)).toBe(303);
  });

  it("floors and ceilings in the right direction on both sides of zero", () => {
    expect(ExactFraction.of(new Decimal("2.5")).floor()).toBe(2n);
    expect(ExactFraction.of(new Decimal("2.5")).ceil()).toBe(3n);
    expect(ExactFraction.of(new Decimal("-2.5")).floor()).toBe(-3n);
    expect(ExactFraction.of(new Decimal("-2.5")).ceil()).toBe(-2n);
    expect(ExactFraction.of(3).floor()).toBe(3n);
    expect(ExactFraction.of(3).ceil()).toBe(3n);
  });

  it("keeps the sign right when dividing by a negative", () => {
    expect(ExactFraction.of(1).dividedBy(ExactFraction.of(-4)).floor()).toBe(-1n);
    expect(ExactFraction.of(1).dividedBy(ExactFraction.of(-4)).ceil()).toBe(0n);
  });

  it("rejects a non-finite amount and a zero divisor", () => {
    expect(() => ExactFraction.of(new Decimal(Infinity))).toThrow(RangeError);
    expect(() => ExactFraction.of(1).dividedBy(ExactFraction.of(0))).toThrow(RangeError);
  });
});

describe("brlFromCentavos", () => {
  it("reads a centavo count as exact decimal reais", () => {
    expect(brlFromCentavos(3144).toString()).toBe("31.44");
    expect(brlFromCentavos(0).toString()).toBe("0");
    expect(brlFromCentavos(1).toString()).toBe("0.01");
  });

  it("round-trips through ceilToCentavos unchanged", () => {
    expect(ceilToCentavos(brlFromCentavos(3144))).toBe(3144);
  });

  it("rejects a fractional centavo count", () => {
    expect(() => brlFromCentavos(3144.5)).toThrow(RangeError);
  });
});

describe("ceilToCentavos", () => {
  it("rounds up at the 2nd decimal place where round-half would round down", () => {
    expect(ceilToCentavos(new Decimal("31.4375"))).toBe(3144);
  });

  it("rounds up any remainder past the 2nd decimal place", () => {
    expect(ceilToCentavos(new Decimal("31.441"))).toBe(3145);
    expect(ceilToCentavos(new Decimal("31.4400001"))).toBe(3145);
  });

  it("leaves a value already exact to the centavo alone", () => {
    expect(ceilToCentavos(new Decimal("31.440"))).toBe(3144);
    expect(ceilToCentavos(new Decimal("0"))).toBe(0);
  });

  it("never truncates", () => {
    // Truncation would give 3144 for all three; ceiling is the business rule.
    expect(ceilToCentavos(new Decimal("31.4401"))).toBe(3145);
    expect(ceilToCentavos(new Decimal("31.4499"))).toBe(3145);
    expect(ceilToCentavos(new Decimal("31.4450"))).toBe(3145);
  });

  it("keeps precision a float would lose", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in IEEE-754, which would ceiling to 31 centavos.
    expect(ceilToCentavos(new Decimal("0.1").plus(new Decimal("0.2")))).toBe(30);
  });

  it("rejects a non-finite amount", () => {
    expect(() => ceilToCentavos(new Decimal(Infinity))).toThrow(RangeError);
    expect(() => ceilToCentavos(new Decimal(NaN))).toThrow(RangeError);
  });

  it("stores up to the exact integer range and rejects a centavo past it", () => {
    expect(ceilToCentavos(new Decimal("90071992547409.91"))).toBe(MAX_EXACT_COUNT);
    expect(() => ceilToCentavos(new Decimal("90071992547409.92"))).toThrow(RangeError);
  });
});

describe("maxMinorUnitsWithinCentavos", () => {
  it("returns the largest count whose ceiled total still fits, and no more", () => {
    // 3 centavos per minor unit: the bound is floor((2^53 − 1) / 3).
    const brlPerMinorUnit = ExactFraction.of(new Decimal("0.03"));

    const max = maxMinorUnitsWithinCentavos(brlPerMinorUnit);

    expect(max).toBe(3002399751580330);
    expect(ceilToCentavos(brlPerMinorUnit.times(ExactFraction.of(max)))).toBe(9007199254740990);
    expect(() => ceilToCentavos(brlPerMinorUnit.times(ExactFraction.of(max + 1)))).toThrow(
      RangeError,
    );
  });

  it("is capped by the quantity column itself when a minor unit costs under a centavo", () => {
    expect(maxMinorUnitsWithinCentavos(ExactFraction.of(new Decimal("0.00001")))).toBe(
      MAX_EXACT_COUNT,
    );
  });

  it("rejects a rate at which not even one minor unit fits", () => {
    expect(() => maxMinorUnitsWithinCentavos(ExactFraction.of(new Decimal("1e14")))).toThrow(
      RangeError,
    );
  });
});

describe("unit price sub-units", () => {
  it("preserves the reference per-minor-unit rate exactly through a round trip", () => {
    // 100 MXN costing R$31.44 is 0.00314375 BRL per MXN centavo — not a whole centavo, which
    // is why unit_price is scaled by 10^8.
    const rate = new Decimal("0.00314375");

    const stored = ceilToUnitPriceSubUnits(rate);

    expect(stored).toBe(314375);
    expect(brlFromUnitPriceSubUnits(stored).equals(rate)).toBe(true);
  });

  it("stores a rate that a centavo scale would have flattened to zero", () => {
    expect(ceilToUnitPriceSubUnits(new Decimal("0.00000001"))).toBe(1);
  });

  it("ceilings a non-terminating rate rather than understating it", () => {
    // 5.00 / 3.00 / 100 repeats forever, so 10^8 sub-units is still a rounded figure.
    const rate = new Decimal("5.00").dividedBy(new Decimal("3.00")).dividedBy(100);

    expect(ceilToUnitPriceSubUnits(rate)).toBe(1666667);
    expect(brlFromUnitPriceSubUnits(1666667).greaterThan(rate)).toBe(true);
  });

  it("rejects a fractional sub-unit count", () => {
    expect(() => brlFromUnitPriceSubUnits(314375.5)).toThrow(RangeError);
  });
});

describe("destination minor units", () => {
  it("reads a minor-unit count as whole destination units", () => {
    expect(destinationUnitsFromMinorUnits(10000).toString()).toBe("100");
    expect(destinationUnitsFromMinorUnits(1).toString()).toBe("0.01");
  });

  it("converts whole destination units back to a minor-unit count", () => {
    expect(destinationMinorUnitsFromUnits(new Decimal("100"))).toBe(10000);
    expect(destinationMinorUnitsFromUnits(new Decimal("0.01"))).toBe(1);
  });

  it("rejects a quantity finer than the currency's minor unit", () => {
    expect(() => destinationMinorUnitsFromUnits(new Decimal("0.005"))).toThrow(RangeError);
  });

  it("rejects a fractional minor-unit count", () => {
    expect(() => destinationUnitsFromMinorUnits(10000.5)).toThrow(RangeError);
  });
});

describe("spreadMultiplierFromBasisPoints", () => {
  it("produces the exact multiplier for each seeded user's spread", () => {
    expect(spreadMultiplierFromBasisPoints(0).toString()).toBe("1");
    expect(spreadMultiplierFromBasisPoints(60).toString()).toBe("1.006");
    expect(spreadMultiplierFromBasisPoints(100).toString()).toBe("1.01");
  });

  it("reproduces the business reference check when applied to the composed cost", () => {
    // USDT/BRL ask 5.00, USDT/MXN bid 16.00, spread 0.6% → 100 MXN costs R$31.44.
    const composed = new Decimal("100").dividedBy("16.00").times("5.00");

    expect(ceilToCentavos(composed.times(spreadMultiplierFromBasisPoints(60)))).toBe(3144);
  });

  it("rejects a fractional basis-point count", () => {
    expect(() => spreadMultiplierFromBasisPoints(60.5)).toThrow(RangeError);
  });
});
