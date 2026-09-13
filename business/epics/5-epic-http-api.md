# Epic 5: HTTP API

## Goal
Expose the backend's capabilities over HTTP, wiring persistence, market data, and business logic into the five required operations.

## Scope
- `POST` login by username (no password)
- `GET` list of supported destination currencies
- `POST` create quote (destination currency + amount → calculated price)
- `POST` confirm quote
- `GET` history of confirmed quotes for the authenticated user
  - History lists each quote's own fields; no aggregate (e.g. a total spent) is required. Each
    per-quote amount is capped at 2^53 − 1 (see DECISIONS.md, Epic 4), but that cap does not
    extend to a sum: many quotes that each fit can add up past it. If a total is ever added, sum
    it exactly (SQL `SUM` read back with better-sqlite3's `safeIntegers`, or `bigint`/`Decimal`
    in application code) and send it as a string, never as a JavaScript `number`.
- Request validation and consistent error response shape
- AuthN/session wiring for the authenticated endpoints

## Out of scope
- Business rule implementation itself (Epic 4)
- Frontend consumption (Epic 6)

## Dependencies
Epic 2 (Backend Core & Persistence), Epic 3 (Market Data & Exchange Integration), Epic 4 (Quotation Business Logic)

## Tickets
See `business/tickets/` for tickets numbered under this epic.
