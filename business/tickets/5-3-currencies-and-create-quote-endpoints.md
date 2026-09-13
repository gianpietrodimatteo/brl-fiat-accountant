# Ticket 5-3: Supported Currencies & Create-Quote Endpoints

## Epic
Epic 5: HTTP API

## Context
Quote creation lives in [[4-3]]'s `QuoteService.createQuote`, which already returns every outcome as a typed result. This ticket exposes it, and the list of quotable currencies the quotation screen needs, over HTTP. The work is validating the request, mapping each result to one status code and error code, and shaping the created quote with amounts as integer minor units on the wire.

## Scope
- `GET /api/currencies` (no authentication: the list is not user-specific)
  - `200` with `{ "currencies": [{ "code": string, "name": string | null }] }`
  - read through `SupportedCurrencyRepository.listAll()` (or a thin service over it), ordered by `code`
  - never a hardcoded list in the route
- `POST /api/quotes`, authenticated with [[5-2]]'s hook. JSON body:
  - `{ "destinationCurrency": string, "quantity": integer }`, where `quantity` counts destination-currency minor units (100 MXN is `10000`), matching `CreateQuoteInput`
  - schema: both fields required, `quantity` a JSON integer (no strings, no fractions, no coercion per [[5-1]]), no extra properties
  - the user id always comes from the authenticated request, never from the body
- Map `CreateQuoteResult` exhaustively. A TypeScript exhaustiveness check ensures a new status cannot silently fall through.
  - `created` → `201` with `{ "quote": QuoteResponse }`
  - `invalid_quantity` → `400`, code `invalid_quantity`
  - `unsupported_currency` → `400`, code `unsupported_currency`
  - `quantity_too_large` → `422`, code `quantity_too_large`, with an additional `maxQuantity` integer on the error object
  - `no_quote_capability` → `503`, code `no_quote_capability`, with a client-safe message. The internal `reason` may be logged but is not the response text.
  - `unknown_user` → `401`, code `unauthorized`
- `QuoteResponse`:
  - `id`
  - `destinationCurrency`
  - `quantity`: integer destination minor units
  - `unitPrice`: integer BRL sub-units at 10^8, per DECISIONS.md
  - `totalPrice`: integer BRL centavos
  - `createdAt`, `expiresAt`: ISO 8601 UTC strings
  - Field docs (e.g. a JSDoc on the response type and the route's response schema) state each integer's unit. Every integer is the stored value itself, never re-derived arithmetic.
- Draft a `DECISIONS.md` entry for the user to paste in: integer minor units on the wire (safe because of Epic 4's 2^53 − 1 cap), and the rejected alternative of decimal strings.

## Out of scope
- Pricing, spread, rounding, the quantity caps and currency validation themselves: all [[4-2]]/[[4-3]], called, never re-implemented
- Confirmation and history routes (ticket 5-4)
- Formatting minor units for display (Epic 6)

## Acceptance Criteria
- [ ] `GET /api/currencies` returns `200` with exactly `ARS, COP, EUR, MXN, ZAR`, sourced from the database: a test that removes a row sees it disappear from the response
- [ ] Authenticated as `bob` in Simulated Mode with fake prices USDT/BRL ask `5.00` and USDT/MXN bid `16.00`, `POST /api/quotes` `{ "destinationCurrency": "MXN", "quantity": 10000 }` returns `201` with `totalPrice === 3144`, integer `quantity === 10000`, and `expiresAt` exactly 10 000 ms after `createdAt` ([[business]]'s reference check through the HTTP layer)
- [ ] The same request as `alice` (0% spread) returns a lower `totalPrice` than as `bob`, confirming the spread comes from the token's user and not the body
- [ ] `quantity` sent as `"10000"`, `100.5`, `0`, `-1` or omitted returns `400`: a type or shape problem gives `validation_error`, and a well-typed non-positive integer gives `invalid_quantity`
- [ ] `destinationCurrency` `"USD"` or `"mxn"` returns `400`, code `unsupported_currency`, and inserts no quote row
- [ ] A quantity above the cap returns `422`, code `quantity_too_large`, with an integer `maxQuantity`, and inserts no quote row
- [ ] With the fake Binance configured unavailable (via `fakeUnavailable` from [[3-4]]'s fakes, not a new mocking layer), `POST /api/quotes` returns `503`, code `no_quote_capability`, inserts no quote row, and the app keeps serving the next request
- [ ] `POST /api/quotes` without a valid bearer token returns `401`, code `unauthorized`, and inserts no quote row
- [ ] Every integer in `QuoteResponse` is a JSON integer equal to the stored column value, and no floating-point money value appears anywhere in the response
- [ ] The route handler contains no price, spread or rounding arithmetic; it only calls `QuoteService.createQuote` and shapes the result
- [ ] Draft `DECISIONS.md` text for integer minor units on the wire is handed to the user; `DECISIONS.md` itself is not edited
- [ ] Tests (Vitest, colocated per [[backend]]) run through `app.inject()` against a real in-memory SQLite database with the Simulated Mode fakes
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 5-2 (Login Endpoint & Bearer-Token Authentication), Ticket 4-3 (Quote Creation & 10-Second Lifecycle)
