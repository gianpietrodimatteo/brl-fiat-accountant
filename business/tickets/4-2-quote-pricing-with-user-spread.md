# Ticket 4-2: Quote Pricing with User Spread

## Epic
Epic 4: Quotation Business Logic

## Context
[[3-3]]'s `MarketDataService` hands over the two composed legs (USDT/BRL ask and USDT/`<destino>` bid) but deliberately knows nothing about users or spread. This ticket adds the one place in the codebase that turns those legs plus a user's spread into the BRL amounts a quote row stores, and pins it to the reference check in [[business]].

## Scope
- A pure pricing unit under `backend/src/domain/` (e.g. `pricing.ts`) that takes the `ComposedPrice` from [[3-3]], the requested quantity in destination minor units, and the user's spread in basis points, and returns the `unit_price` and `total_price` values in the representations settled in [[4-1]].
- The formula follows [[business]] in order: BRL per destination unit is the USDT/BRL **ask** divided by the USDT/`<destino>` **bid**; the user's spread is applied on top of that composed BRL cost; the total is that rate times the quantity; only then is the total ceiled to 2 decimal places.
- Rounding happens exactly once, on the total. The stored `unit_price` is never used to derive the total — a per-unit ceiling applied before multiplying would turn the reference case into R$32.00 instead of R$31.44.
- All arithmetic in `Decimal` via [[4-1]]'s helpers. Conversion to integer minor units happens only on the returned values.
- No I/O: this unit does not read the database, call an exchange, or read a clock.

## Out of scope
- Fetching or composing the legs (Epic 3, already done in [[3-3]])
- Looking up the user's spread or validating the destination currency (ticket 4-3)
- Persisting the quote, expiry, confirmation (tickets 4-3, 4-4)
- HTTP request/response shaping (Epic 5)

## Acceptance Criteria
- [ ] The reference check reproduces exactly: USDT/BRL ask 5.00, USDT/MXN bid 16.00, spread 60 bps, quantity 100 MXN → `total_price` of `3144` centavos (R$31.44)
- [ ] The same inputs with spread `0` produce `3125` centavos (R$31.25), and with spread `100` bps produce `3157` centavos (R$31.5625 ceiled)
- [ ] A case whose unrounded total already has at most 2 decimals is not inflated by the ceiling (e.g. a total of exactly 31.25 stays `3125`, not `3126`)
- [ ] A case where per-unit rounding would diverge from total rounding is covered by a test asserting the total-based result, so the rounding order can't silently regress
- [ ] The returned `unit_price` reflects the spread-applied rate at [[4-1]]'s scale, and a test asserts it for the reference case
- [ ] A non-terminating division (e.g. ask 5.00 / bid 3.00) produces a total without throwing and without floating-point drift
- [ ] The pricing unit is called with no database, exchange client, or clock — verified by its tests needing none of them
- [ ] Tests (Vitest, colocated per [[backend]]) cover all the above
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 4-1 (Monetary Representation & Rounding Primitives), Ticket 3-3 (Price Composition & Availability Handling)
