# Ticket 4-1: Monetary Representation & Rounding Primitives

## Epic
Epic 4: Quotation Business Logic

## Context
Every other ticket in this epic multiplies, divides and rounds money, and [[business]] forbids floating-point `number` anywhere in that path. This ticket settles the representation for each monetary value a quote carries and provides the single set of conversion/rounding helpers the pricing, lifecycle and confirmation tickets all use, so no ticket re-invents a rounding rule.

## Scope
- A money module under `backend/src/domain/` (e.g. `money.ts`) built on `decimal.js` (already a backend dependency), exposing:
  - Conversion between BRL centavos (`INTEGER`, per `DECISIONS.md`) and `Decimal`.
  - `ceilToCentavos(value: Decimal): number` — the [[business]] rounding rule: exactly 2 decimal places, always ceiling, never round-half and never truncate.
  - Conversion between a user's spread in basis points (`users.spread`, `INTEGER`) and the `Decimal` multiplier the pricing formula applies.
  - Conversion between destination-currency minor units (`quotes.quantity`, `INTEGER` — 100 MXN is `10000`) and whole destination units as a `Decimal`.
  - Conversion for `quotes.unit_price` at its high-precision scale (see below).
- Settle `quotes.unit_price`'s representation. The reference check in [[business]] (USDT/BRL ask 5.00, USDT/MXN bid 16.00, spread 0.6% → 100 MXN costs R$31.44) puts the ceiling rounding on the **total**, which leaves the per-unit price at 0.3144 BRL — not a whole centavo. Per the user's decision, `unit_price` becomes a higher-precision integer: BRL scaled by `10^8` sub-units, so 0.00314375 BRL per MXN minor unit is stored exactly rather than rounded to centavos.
- A migration under `backend/src/db/migrations/` that rescales `quotes.unit_price` from centavos to the new `10^8` scale. No DDL change is needed (the column is already `INTEGER` and 64-bit is far wider than required), so the migration rewrites existing rows and is a no-op on any database that has no quotes yet.
- Correct the stale unit comments on `backend/src/domain/Quote.ts`: `quantity` is destination-currency minor units (not BRL centavos), `unit_price` is BRL sub-units at the new scale, `total_price` is BRL centavos.
- Draft the `DECISIONS.md` text covering the `unit_price` scale, the rounding direction chosen for storing it, and why it supersedes the "all three money columns are centavos" line already recorded there — then hand that text to the user. Do not edit `DECISIONS.md` directly.

## Out of scope
- The pricing formula itself (ticket 4-2)
- Quote persistence, expiry or confirmation (tickets 4-3, 4-4)
- Changing `quotes.quantity` or `quotes.total_price` representation — both stay as `DECISIONS.md` already records them
- Presentation/formatting for HTTP responses (Epic 5)

## Acceptance Criteria
- [ ] `ceilToCentavos` rounds up at the 2nd decimal place for a value that a round-half rule would round down (e.g. 31.4375 → `3144`, 31.441 → `3145`, 31.440 → `3144`)
- [ ] No function in the money module accepts or returns a JavaScript `number` for a value carrying more precision than its integer minor unit — all intermediate arithmetic is `Decimal`
- [ ] Basis-point conversion produces the exact multipliers for the three seeded users: `0` → 1, `60` → 1.006, `100` → 1.01
- [ ] Round-tripping a value through the `unit_price` sub-unit conversion preserves 0.00314375 BRL per destination minor unit exactly
- [ ] Running migrations against a fresh SQLite file applies the rescale migration without error, and running them twice does not apply it twice
- [ ] The rescale migration multiplies a pre-existing centavo-scaled `unit_price` row into the new scale (covered by a test that inserts a row before the migration and asserts the value after)
- [ ] `backend/src/domain/Quote.ts` comments state the correct unit for all three money-bearing fields
- [ ] The drafted `DECISIONS.md` text is presented to the user; `DECISIONS.md` itself is unmodified
- [ ] Tests (Vitest, colocated per [[backend]]) cover every helper above, including the boundary cases named here
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 2-1 (SQLite Schema & Migrations), Ticket 2-2 (Domain Models & Repository Layer)
