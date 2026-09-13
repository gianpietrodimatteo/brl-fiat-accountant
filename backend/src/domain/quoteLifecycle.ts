import type { Quote } from "./Quote";

/**
 * The single definition of a quote's validity window, per [[business]]: a quote is valid for
 * exactly 10 seconds from creation.
 *
 * Creation and confirmation both read the window from here so it is never re-derived — and so
 * changing it stays a one-line change.
 */
export const QUOTE_TTL_MS = 10_000;

/** The instant a quote created at `createdAt` stops being quotable. */
export function expiresAtFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + QUOTE_TTL_MS);
}

/**
 * The one expiry predicate in the system.
 *
 * It depends only on `expires_at`, never on `created_at` plus the TTL. That is deliberate:
 * `created_at`'s column default is SQLite's `datetime('now')`, whose `YYYY-MM-DD HH:MM:SS` form
 * carries no timezone designator, and `new Date("2026-09-12 10:00:00")` is read as local time —
 * deriving the window from such a value would shift it by the host's UTC offset. `expires_at` is
 * always written as an ISO 8601 UTC string, so this comparison is timezone-independent.
 *
 * The boundary is inclusive of the last valid instant: a quote is still good at exactly
 * `expires_at` and expired one millisecond later.
 */
export function isExpired(quote: Pick<Quote, "expiresAt">, now: Date): boolean {
  return now.getTime() > quote.expiresAt.getTime();
}
