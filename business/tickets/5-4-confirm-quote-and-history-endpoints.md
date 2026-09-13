# Ticket 5-4: Confirm-Quote & Confirmed-Quote History Endpoints

## Epic
Epic 5: HTTP API

## Context
[[4-4]] made confirmation exactly-once and expiry-safe in a single SQL statement, and added `listHistory`. This ticket exposes both over HTTP for the authenticated user. The confirm route's status codes must let the frontend tell "expired" apart from every other failure (the spec's expired-quote message). Concurrent confirmations over HTTP must still record exactly one confirmation.

## Scope
- `POST /api/quotes/:id/confirm`, authenticated with [[5-2]]'s hook; no request body.
  - `:id` is validated as a positive integer by the route schema: anything else returns `400`, code `validation_error`.
  - The user id comes only from the authenticated request.
- Map `ConfirmQuoteResult` exhaustively, with a TypeScript exhaustiveness check:
  - `confirmed` → `200` with `{ "quote": QuoteResponse }`, the same shape as [[5-3]] plus `confirmedAt` (ISO 8601 UTC)
  - `expired` → `410`, code `quote_expired`
  - `already_confirmed` → `409`, code `quote_already_confirmed`
  - `not_found` → `404`, code `quote_not_found`
  - `not_owner` → `404`, code `quote_not_found`, identical to `not_found`, so another user's quote ids cannot be probed and nothing about the quote leaks
- `GET /api/quotes/history`, authenticated. `200` with `{ "quotes": HistoryItem[] }`, newest first as `listHistory` returns them; an empty list when there are none.
- `HistoryItem`:
  - `id`
  - `destinationCurrency`
  - `quantity`: integer destination minor units
  - `unitPrice`: integer BRL sub-units at 10^8
  - `totalPrice`: integer BRL centavos
  - `createdAt`, `confirmedAt`: ISO 8601 UTC strings
  - Same units and field names as `QuoteResponse`.
- `QuoteService.listHistory` currently returns `Decimal`s. Converting back to integer minor units goes through `backend/src/domain/money.ts` helpers, adding the missing inverse helpers there if needed, or through a service method that exposes the stored integers. Either way, no ad-hoc `× 100` arithmetic in the route handler.
- No aggregate: per Epic 5's scope, history carries no total. If a total is ever added it must be summed exactly and sent as a string, but that is not part of this ticket.

## Out of scope
- The confirmation concurrency guarantee and expiry check themselves ([[4-4]]): called, never re-implemented or pre-checked in the route
- Any total or summary across history
- Filters, pagination or sorting options on history (not in the spec)
- Frontend expired-quote messaging and history screen (Epic 6)

## Acceptance Criteria
- [ ] Authenticated as the quote's owner, confirming a fresh quote from `POST /api/quotes` returns `200` with a non-null `confirmedAt`, and the quote then appears in `GET /api/quotes/history` with the same `quantity`, `unitPrice` and `totalPrice` integers the create response returned
- [ ] Ten concurrent `POST /api/quotes/:id/confirm` requests for one quote (`Promise.all` over `app.inject()`) produce exactly one `200` and nine `409 quote_already_confirmed`, and the database holds exactly one non-null `confirmed_at` for it
- [ ] With the injected clock advanced past `expiresAt`, confirming returns `410`, code `quote_expired`; `confirmed_at` stays `NULL` and the quote is absent from history
- [ ] Confirming another user's quote returns `404` with a body byte-for-byte identical to confirming a non-existent id, and does not confirm it
- [ ] `:id` values `abc`, `0`, `-3` and `1.5` return `400`, code `validation_error`
- [ ] Confirm and history without a valid bearer token return `401`, code `unauthorized`, and change nothing
- [ ] `GET /api/quotes/history` returns only the caller's confirmed quotes, newest first, excluding unconfirmed and expired ones; a user with none gets `200` with `{ "quotes": [] }`
- [ ] Every monetary field in history is a JSON integer equal to the stored column, produced without arithmetic in the route handler; the response has no total field
- [ ] All error responses use [[5-1]]'s shared shape
- [ ] Tests (Vitest, colocated per [[backend]]) run through `app.inject()` against a real in-memory SQLite database with the Simulated Mode fakes and an injected clock
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 5-3 (Supported Currencies & Create-Quote Endpoints), Ticket 4-4 (Exactly-Once Confirmation & Confirmed-Quote History)
