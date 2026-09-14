import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatBrl,
  formatQuantity,
  formatTimestamp,
  formatUnitPrice,
  parseQuantity,
} from "./amounts";

describe("parseQuantity", () => {
  it.each([
    ["100", 10000],
    ["100.5", 10050],
    ["100.50", 10050],
    ["0.01", 1],
    ["007", 700],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("reads %j as %i minor units", (input, quantity) => {
    expect(parseQuantity(input)).toEqual({ ok: true, quantity });
  });

  it.each([
    ["", "empty"],
    ["abc", "not_a_number"],
    ["-1", "not_a_number"],
    ["+1", "not_a_number"],
    ["1e3", "not_a_number"],
    ["1,5", "not_a_number"],
    [" 100", "not_a_number"],
    ["100.", "not_a_number"],
    [".5", "not_a_number"],
    ["Infinity", "not_a_number"],
    ["100.505", "too_many_decimals"],
    ["100.500", "too_many_decimals"],
    ["0", "zero"],
    ["0.00", "zero"],
    ["90071992547409.92", "too_large"],
    ["9".repeat(400), "too_large"],
  ])("rejects %j as %s", (input, reason) => {
    expect(parseQuantity(input)).toEqual({ ok: false, reason });
  });
});

describe("formatQuantity", () => {
  it.each([
    [10000, "100.00"],
    [10050, "100.50"],
    [1, "0.01"],
    [0, "0.00"],
  ])("shows %i minor units as %j", (minorUnits, text) => {
    expect(formatQuantity(minorUnits)).toBe(text);
  });
});

describe("formatBrl", () => {
  it.each([
    [3144, "R$ 31.44"],
    [5, "R$ 0.05"],
    [0, "R$ 0.00"],
    [Number.MAX_SAFE_INTEGER, "R$ 90071992547409.91"],
  ])("shows %i centavos as %j", (centavos, text) => {
    expect(formatBrl(centavos)).toBe(text);
  });

  it.each([1.5, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("refuses %d", (amount) => {
    expect(() => formatBrl(amount)).toThrow(RangeError);
  });
});

describe("formatUnitPrice", () => {
  it.each([
    [314375, "R$ 0.314375"],
    [500000000, "R$ 500.00"],
    [310000, "R$ 0.31"],
    [1, "R$ 0.000001"],
    [Number.MAX_SAFE_INTEGER, "R$ 9007199254.740991"],
  ])("shows %i sub-units as %j per destination unit", (subUnits, text) => {
    expect(formatUnitPrice(subUnits)).toBe(text);
  });
});

describe("formatTimestamp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the instant in the browser's time zone", () => {
    vi.stubEnv("TZ", "America/Sao_Paulo");
    const iso = "2026-09-14T12:34:56.000Z";

    const text = formatTimestamp(iso);

    expect(text).toBe(new Date(iso).toLocaleString(undefined, { timeZone: "America/Sao_Paulo" }));
    expect(text).not.toBe(new Date(iso).toLocaleString(undefined, { timeZone: "UTC" }));
  });
});
