import Decimal from "decimal.js";

/**
 * The single place that knows how each monetary value is represented, per DECISIONS.md.
 *
 * Every column is an `INTEGER` count of some minor unit, and every value that carries more
 * precision than one of those counts is a `Decimal`. Nothing here accepts or returns a
 * JavaScript `number` for a fractional amount, so no caller can leak floating point into the
 * pricing path — [[business]] forbids it.
 */

/** BRL's minor unit: `quotes.total_price` counts centavos, so R$31.44 is `3144`. */
const CENTAVOS_PER_BRL = new Decimal(100);

/**
 * `quotes.unit_price`'s scale: BRL sub-units at 10^8, so 0.00314375 BRL per destination minor
 * unit is stored as `314375` instead of being flattened to a whole centavo.
 */
const SUB_UNITS_PER_BRL = new Decimal("1e8");

/**
 * `quotes.quantity`'s scale. Every supported destination currency (EUR, ARS, COP, MXN, ZAR) is
 * an ISO 4217 currency with two decimal places, so 100 MXN is `10000`.
 */
const MINOR_UNITS_PER_DESTINATION_UNIT = new Decimal(100);

/** `users.spread` is basis points: 0.6% is `60`, 1% is `100`. */
const BASIS_POINTS_PER_UNIT = new Decimal(10000);

/**
 * The largest count any monetary column can round-trip exactly.
 *
 * SQLite's `INTEGER` holds up to 2^63 − 1, so the column is not the bottleneck. better-sqlite3
 * reads an `INTEGER` back as a JavaScript `number`, and so does every client parsing our JSON,
 * which is exact only up to 2^53 − 1: past it a stored value comes back silently altered. Every
 * quantity and every total must therefore stay within this bound.
 */
export const MAX_EXACT_COUNT = Number.MAX_SAFE_INTEGER;

/**
 * An exact fraction of two integers, for a chain of arithmetic that is rounded only once, at the
 * end.
 *
 * decimal.js rounds the result of every operation to 20 significant digits, half-up. Rounding a
 * non-terminating division before the final ceiling can push a total onto the wrong side of a
 * centavo in either direction: 5.00 / 18.7 × 1.01 × 11.22 is exactly R$3.03, but rounding the
 * division first leaves it a hair above and the ceiling charges R$3.04. A fraction of `bigint`s
 * never rounds, so the ceiling sees the true value.
 */
export class ExactFraction {
  private constructor(
    private readonly numerator: bigint,
    /** Always positive, so the sign lives on the numerator alone. */
    private readonly denominator: bigint,
  ) {}

  /** Captures a finite decimal exactly — its digits, not a rounded approximation of them. */
  static of(value: Decimal | number): ExactFraction {
    const decimal = new Decimal(value);
    if (!decimal.isFinite()) {
      throw new RangeError(`Cannot represent a non-finite amount: ${decimal.toString()}`);
    }
    const [whole, fraction = ""] = decimal.toFixed().split(".");
    return new ExactFraction(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
  }

  times(other: ExactFraction): ExactFraction {
    return new ExactFraction(
      this.numerator * other.numerator,
      this.denominator * other.denominator,
    );
  }

  dividedBy(other: ExactFraction): ExactFraction {
    if (other.numerator === 0n) {
      throw new RangeError("Cannot divide by zero");
    }
    const sign = other.numerator < 0n ? -1n : 1n;
    return new ExactFraction(
      this.numerator * other.denominator * sign,
      this.denominator * other.numerator * sign,
    );
  }

  floor(): bigint {
    const quotient = this.numerator / this.denominator;
    // bigint division truncates toward zero, which is one too high for a negative remainder.
    return this.numerator % this.denominator < 0n ? quotient - 1n : quotient;
  }

  ceil(): bigint {
    const quotient = this.numerator / this.denominator;
    return this.numerator % this.denominator > 0n ? quotient + 1n : quotient;
  }
}

/** Reads a BRL centavo count off a column into exact decimal reais. */
export function brlFromCentavos(centavos: number): Decimal {
  assertMinorUnitCount(centavos, "centavos");
  return new Decimal(centavos).dividedBy(CENTAVOS_PER_BRL);
}

/**
 * Rounds decimal reais to a centavo count for storage.
 *
 * [[business]] fixes the rule: exactly 2 decimal places, always ceiling. Never round-half and
 * never truncate, so a quote can never understate what the client owes.
 */
export function ceilToCentavos(value: Decimal | ExactFraction): number {
  return toExactCount(scaleAndCeil(value, CENTAVOS_PER_BRL), "centavos");
}

/**
 * The largest count of destination minor units whose ceiled total, at `brlPerMinorUnit`, still
 * fits in `quotes.total_price` — never more than `quotes.quantity` itself can hold.
 *
 * `MAX_EXACT_COUNT` is a whole number, so a ceiled total stays within it exactly when the unrounded
 * total does: the answer is the floor of the bound over the rate, with no off-by-one either way.
 */
export function maxMinorUnitsWithinCentavos(brlPerMinorUnit: ExactFraction): number {
  const centavosPerMinorUnit = brlPerMinorUnit.times(ExactFraction.of(CENTAVOS_PER_BRL));
  const fitting = ExactFraction.of(MAX_EXACT_COUNT).dividedBy(centavosPerMinorUnit).floor();
  if (fitting < 1n) {
    throw new RangeError(`One minor unit at this rate already exceeds ${MAX_EXACT_COUNT} centavos`);
  }
  return fitting > BigInt(MAX_EXACT_COUNT) ? MAX_EXACT_COUNT : Number(fitting);
}

/** Reads a `quotes.unit_price` sub-unit count into exact decimal reais. */
export function brlFromUnitPriceSubUnits(subUnits: number): Decimal {
  assertMinorUnitCount(subUnits, "unit price sub-units");
  return new Decimal(subUnits).dividedBy(SUB_UNITS_PER_BRL);
}

/**
 * Rounds decimal reais to a `quotes.unit_price` sub-unit count for storage.
 *
 * The per-unit rate can be non-terminating (an ask of 5.00 over a bid of 3.00), so even at 10^8
 * this is a rounded figure. It ceilings for the same reason `ceilToCentavos` does: no rounding
 * step anywhere in the system may understate the cost. `total_price` is always computed from
 * the full-precision chain rather than by multiplying this value back out.
 */
export function ceilToUnitPriceSubUnits(value: Decimal | ExactFraction): number {
  return toExactCount(scaleAndCeil(value, SUB_UNITS_PER_BRL), "unit price sub-units");
}

/** Reads a `quotes.quantity` minor-unit count into whole destination units. */
export function destinationUnitsFromMinorUnits(minorUnits: number): Decimal {
  assertMinorUnitCount(minorUnits, "destination minor units");
  return new Decimal(minorUnits).dividedBy(MINOR_UNITS_PER_DESTINATION_UNIT);
}

/**
 * Converts whole destination units to a `quotes.quantity` minor-unit count.
 *
 * A quantity is what the client asked to buy, not a computed price, so there is nothing here to
 * round in either direction: a value finer than the currency's minor unit is a bad input and is
 * rejected rather than quietly reshaped into a different order.
 */
export function destinationMinorUnitsFromUnits(units: Decimal): number {
  const minorUnits = units.times(MINOR_UNITS_PER_DESTINATION_UNIT);
  if (!minorUnits.isInteger()) {
    throw new RangeError(`${units.toString()} is finer than the destination currency's minor unit`);
  }
  return toExactCount(ExactFraction.of(minorUnits).floor(), "destination minor units");
}

/**
 * Turns a user's spread into the multiplier the pricing formula applies to the composed BRL
 * cost: 0 basis points is 1, 60 is 1.006, 100 is 1.01.
 */
export function spreadMultiplierFromBasisPoints(basisPoints: number): Decimal {
  assertMinorUnitCount(basisPoints, "basis points");
  return new Decimal(1).plus(new Decimal(basisPoints).dividedBy(BASIS_POINTS_PER_UNIT));
}

function scaleAndCeil(value: Decimal | ExactFraction, unitsPerBrl: Decimal): bigint {
  const exact = value instanceof ExactFraction ? value : ExactFraction.of(value);
  return exact.times(ExactFraction.of(unitsPerBrl)).ceil();
}

function assertMinorUnitCount(value: number, unitName: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Expected a whole number of ${unitName}, got ${value}`);
  }
}

function toExactCount(value: bigint, unitName: string): number {
  if (value > BigInt(MAX_EXACT_COUNT) || value < -BigInt(MAX_EXACT_COUNT)) {
    throw new RangeError(`${value.toString()} ${unitName} exceeds the exact integer range`);
  }
  return Number(value);
}
