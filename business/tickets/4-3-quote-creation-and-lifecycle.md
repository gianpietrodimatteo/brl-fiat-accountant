# Ticket 4-3: Quote Creation & 10-Second Lifecycle

## Epic
Epic 4: Quotation Business Logic

## Context
[[4-2]] can price a quote but nothing yet decides who is asking, whether the currency is allowed, or when the quote dies. This ticket adds the service that Epic 5's create-quote endpoint calls: it gathers the user's spread and the composed price, prices the quote, persists it with its expiry, and owns the single definition of "expired" that [[4-4]] also uses.

## Scope
- A quote service under `backend/src/services/` (e.g. `QuoteService.ts`) with a `createQuote({ userId, destinationCurrency, quantity })` operation that:
  - Resolves the user through `UserRepository` to read their spread (per [[business]], spread is per-user and applies only to that user's own quotes).
  - Rejects a destination currency that `SupportedCurrencyRepository` does not list — [[business]] allows exactly `EUR`, `ARS`, `COP`, `MXN`, `ZAR`.
  - Asks [[3-3]]'s `MarketDataService` for the composed price and, when it answers `no_quote_capability`, returns a typed "no quote capability" result rather than an error or a fabricated price.
  - Prices the quote with [[4-2]] and persists it through `QuoteRepository.create`.
- Returns a discriminated result the HTTP layer can map without inspecting exceptions: created, unknown user, unsupported currency, invalid quantity, no quote capability.
- The 10-second validity window from [[business]]: a single `QUOTE_TTL_MS` constant (exactly 10 000 ms), and `expires_at` written as creation time plus that TTL.
- An injectable clock (e.g. a `() => Date` passed to the constructor, defaulting to `Date.now`) so lifecycle behaviour is testable without real waiting.
- A single exported expiry predicate (e.g. `isExpired(quote, now)`) that [[4-4]] reuses, so the window is never re-derived in two places.
- Timestamps must be unambiguous: `created_at` currently defaults to SQLite's `datetime('now')`, which yields `YYYY-MM-DD HH:MM:SS` with no timezone designator and second-level granularity, while `expires_at` is written as an ISO 8601 UTC string. Expiry must not be computed from a value parsed out of that default, since `new Date("2026-09-12 10:00:00")` is read as local time and would shift the window by the host's UTC offset. Write `created_at` explicitly from the application clock in the same ISO UTC form, or make expiry depend only on `expires_at`.
- Reject a non-positive or non-integer quantity as a typed result, not an exception.

## Out of scope
- Confirmation, exactly-once semantics, and history (ticket 4-4)
- Any change to the pricing formula or rounding (tickets 4-1, 4-2)
- Exchange availability logic — already owned by [[3-3]]
- HTTP routes, request parsing, response shape, session lookup (Epic 5)

## Acceptance Criteria
- [ ] `createQuote` persists a quote whose `expires_at` is exactly 10 000 ms after its creation time, asserted against a fake clock (not a tolerance window)
- [ ] `isExpired` returns false at 9 999 ms after creation, false at exactly 10 000 ms, and true at 10 001 ms — the boundary is pinned by tests either way it is defined
- [ ] `createQuote` with an unsupported currency code (e.g. `GBP`, `usd`, `""`) returns the unsupported-currency result and writes no row to `quotes`
- [ ] `createQuote` returns the no-quote-capability result and writes no row when `MarketDataService` reports Binance unavailable
- [ ] `createQuote` returns the unknown-user result for a `userId` that does not exist, and writes no row
- [ ] `createQuote` with quantity `0`, a negative quantity, or a fractional minor-unit value returns the invalid-quantity result and writes no row
- [ ] The persisted `total_price` for the [[business]] reference case is `3144` when the injected market data gives USDT/BRL ask 5.00 and USDT/MXN bid 16.00 for user `bob` (60 bps)
- [ ] A quote created for one user carries that user's spread only — two users quoting the same currency and quantity against identical market data produce the different totals their spreads imply
- [ ] Expiry decisions are unaffected by the host machine's timezone (covered by a test, or by an assertion that no expiry path parses a non-ISO timestamp)
- [ ] `createQuote` never throws for any of the rejection paths above
- [ ] Tests (Vitest, colocated per [[backend]]) use the Simulated Mode fakes from [[3-4]] as the exchange, per [[backend]]'s rule that `ExchangeClient` consumers reuse them rather than building a second mock layer, and run against a real SQLite database
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 4-2 (Quote Pricing with User Spread), Ticket 2-2 (Domain Models & Repository Layer), Ticket 3-4 (Simulated Mode & Exchange Fakes)
