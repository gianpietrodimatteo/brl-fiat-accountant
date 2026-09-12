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
export function ceilToCentavos(value: Decimal): number {
  return toSafeInteger(scaleAndCeil(value, CENTAVOS_PER_BRL), "centavos");
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
export function ceilToUnitPriceSubUnits(value: Decimal): number {
  return toSafeInteger(scaleAndCeil(value, SUB_UNITS_PER_BRL), "unit price sub-units");
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
  return toSafeInteger(minorUnits, "destination minor units");
}

/**
 * Turns a user's spread into the multiplier the pricing formula applies to the composed BRL
 * cost: 0 basis points is 1, 60 is 1.006, 100 is 1.01.
 */
export function spreadMultiplierFromBasisPoints(basisPoints: number): Decimal {
  assertMinorUnitCount(basisPoints, "basis points");
  return new Decimal(1).plus(new Decimal(basisPoints).dividedBy(BASIS_POINTS_PER_UNIT));
}

function scaleAndCeil(value: Decimal, unitsPerBrl: Decimal): Decimal {
  if (!value.isFinite()) {
    throw new RangeError(`Cannot round a non-finite amount: ${value.toString()}`);
  }
  return value.times(unitsPerBrl).ceil();
}

function assertMinorUnitCount(value: number, unitName: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Expected a whole number of ${unitName}, got ${value}`);
  }
}

function toSafeInteger(value: Decimal, unitName: string): number {
  const asNumber = value.toNumber();
  if (!Number.isSafeInteger(asNumber)) {
    throw new RangeError(`${value.toString()} ${unitName} exceeds the exact integer range`);
  }
  return asNumber;
}
