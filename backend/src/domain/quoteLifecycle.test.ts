import { describe, expect, it } from "vitest";
import { QUOTE_TTL_MS, expiresAtFrom, isExpired } from "./quoteLifecycle";

describe("quoteLifecycle", () => {
  const createdAt = new Date("2026-09-12T10:00:00.000Z");

  it("holds the 10 second validity window from the business rules exactly", () => {
    expect(QUOTE_TTL_MS).toBe(10_000);
  });

  it("expires a quote exactly QUOTE_TTL_MS after its creation", () => {
    expect(expiresAtFrom(createdAt).getTime()).toBe(createdAt.getTime() + 10_000);
  });

  describe("isExpired", () => {
    const quote = { expiresAt: expiresAtFrom(createdAt) };

    function at(millisecondsAfterCreation: number): Date {
      return new Date(createdAt.getTime() + millisecondsAfterCreation);
    }

    it("is not expired one millisecond before the window closes", () => {
      expect(isExpired(quote, at(9_999))).toBe(false);
    });

    it("is not expired at exactly the window's last instant", () => {
      expect(isExpired(quote, at(10_000))).toBe(false);
    });

    it("is expired one millisecond past the window", () => {
      expect(isExpired(quote, at(10_001))).toBe(true);
    });
  });

  it("reads only expires_at, so a created_at in any form cannot shift the window", () => {
    // The quote is handed an expiry that is deliberately inconsistent with any TTL arithmetic
    // over its creation time: if the predicate derived the window itself, this would expire.
    const quote = { expiresAt: new Date("2026-09-12T11:00:00.000Z") };

    expect(isExpired(quote, at1MinuteAfter(createdAt))).toBe(false);
  });
});

function at1MinuteAfter(instant: Date): Date {
  return new Date(instant.getTime() + 60_000);
}
