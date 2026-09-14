/**
 * Exact conversions between the integer amounts the API sends and the text a person reads or
 * types. Each one is a decimal-point shift on the digits of an integer: no division,
 * multiplication or float parsing touches an amount, and nothing is rounded (the backend already
 * rounded). Every destination currency has 2 decimal places, like BRL (see DECISIONS.md Epic 2).
 */

/** Decimal places of BRL and of every destination currency. */
const MINOR_UNIT_PLACES = 2;

/**
 * `unitPrice` is BRL at 10^8 per destination *minor* unit. One destination unit is 10^2 minor
 * units, so BRL per destination unit is the same digits with the point 8 − 2 places in.
 */
const UNIT_PRICE_PLACES = 6;

/** Major units, optionally with a fractional part: no sign, exponent, separators or spaces. */
const PLAIN_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

export type QuantityRejection =
  "empty" | "not_a_number" | "too_many_decimals" | "too_large" | "zero";

export type ParseQuantityResult =
  { ok: true; quantity: number } | { ok: false; reason: QuantityRejection };

/**
 * Major-unit text to integer minor units: `"100.5"` → `10050`. A UX check before sending, not a
 * replacement for the backend's `invalid_quantity` / `quantity_too_large`.
 */
export function parseQuantity(input: string): ParseQuantityResult {
  if (input === "") {
    return { ok: false, reason: "empty" };
  }
  const match = PLAIN_DECIMAL.exec(input);
  if (!match) {
    return { ok: false, reason: "not_a_number" };
  }
  const [, whole, fraction = ""] = match;
  if (fraction.length > MINOR_UNIT_PLACES) {
    return { ok: false, reason: "too_many_decimals" };
  }

  // Padding the fraction and dropping the point shifts it: "100.5" → "10050". Every digit string
  // up to 2^53 − 1 reads back exactly, and anything longer lands at or above 2^53, so the
  // safe-integer check below catches it rather than a silently altered value getting through.
  const quantity = Number(whole + fraction.padEnd(MINOR_UNIT_PLACES, "0"));
  if (!Number.isSafeInteger(quantity)) {
    return { ok: false, reason: "too_large" };
  }
  if (quantity === 0) {
    return { ok: false, reason: "zero" };
  }
  return { ok: true, quantity };
}

/** Destination-currency minor units as major units: `10050` → `"100.50"`. */
export function formatQuantity(minorUnits: number): string {
  return shiftDecimalPoint(minorUnits, MINOR_UNIT_PLACES);
}

/** BRL centavos: `3144` → `"R$ 31.44"`. */
export function formatBrl(centavos: number): string {
  return `R$ ${shiftDecimalPoint(centavos, MINOR_UNIT_PLACES)}`;
}

/**
 * BRL per one destination unit, every significant digit kept: `314375` → `"R$ 0.314375"`.
 * Trailing zeros are trimmed, but never below 2 decimals: `500000000` → `"R$ 500.00"`.
 */
export function formatUnitPrice(subUnits: number): string {
  const [whole, fraction] = shiftDecimalPoint(subUnits, UNIT_PRICE_PLACES).split(".");
  return `R$ ${whole}.${fraction.replace(/0+$/, "").padEnd(MINOR_UNIT_PLACES, "0")}`;
}

/** An ISO 8601 instant as a date and time in the browser's own locale and time zone. */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** `(10050, 2)` → `"100.50"`, on the digits alone. */
function shiftDecimalPoint(amount: number, places: number): string {
  // Anything else isn't an amount the API can send, and showing it would show a wrong price.
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`Expected a non-negative safe integer amount, got ${amount}`);
  }
  const digits = String(amount).padStart(places + 1, "0");
  const point = digits.length - places;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}
