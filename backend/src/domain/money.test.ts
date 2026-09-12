import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  brlFromCentavos,
  brlFromUnitPriceSubUnits,
  ceilToCentavos,
  ceilToUnitPriceSubUnits,
  destinationMinorUnitsFromUnits,
  destinationUnitsFromMinorUnits,
  spreadMultiplierFromBasisPoints,
} from "./money";

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
