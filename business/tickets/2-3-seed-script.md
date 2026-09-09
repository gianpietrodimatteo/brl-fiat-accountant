# Ticket 2-3: Seed Script for Users & Supported Currencies

## Epic
Epic 2: Backend Core & Persistence

## Context
[[business]] pre-seeds three users (`alice` 0%, `bob` 0.6%, `carol` 1%) rather than letting them self-register, and the five supported destination currencies ([[business]]) need to exist as rows before any quote can reference them. This ticket populates that starting data using the repositories from [[2-2]].

## Scope
- A seed script (e.g. `backend/src/seed.ts`, runnable via `npm run seed`) that:
  - Inserts `alice` (0% spread), `bob` (0.6% spread), `carol` (1% spread) via `UserRepository`.
  - Inserts `EUR`, `ARS`, `COP`, `MXN`, `ZAR` via `SupportedCurrencyRepository`.
- The script is idempotent: running it against an already-seeded database does not error or create duplicates (e.g. skip or upsert on the unique username / currency code).
- The script uses the repositories from [[2-2]] — no raw SQL.

## Out of scope
- Schema/migrations (ticket 2-1)
- Repository implementation (ticket 2-2)
- Any login/session logic (ticket 2-4)
- Wiring the seed script into Docker startup or CI (not part of this epic's scope; note it in `DECISIONS.md` if a follow-up is needed)

## Acceptance Criteria
- [ ] Running `npm run seed` against a freshly migrated database creates exactly `alice`, `bob`, `carol` with spreads `0%`, `0.6%`, `1%` respectively
- [ ] Running `npm run seed` against a freshly migrated database creates exactly the five supported currencies (`EUR`, `ARS`, `COP`, `MXN`, `ZAR`)
- [ ] Running `npm run seed` twice in a row does not error and does not produce duplicate users or currencies
- [ ] A test (Vitest, real SQLite per [[testing]]/[[backend]]) verifies the seeded users and currencies after running the seed logic
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 2-2 (Domain Models & Repository Layer)
