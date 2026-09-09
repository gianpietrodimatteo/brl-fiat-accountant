# Ticket 2-2: Domain Models & Repository Layer

## Epic
Epic 2: Backend Core & Persistence

## Context
With the schema in place ([[2-1]]), the rest of the backend needs typed domain models and a data-access layer to talk to SQLite through, so that later epics (market data, pricing, HTTP) never touch raw SQL or the database driver directly, per [[backend]].

## Scope
- Domain model types under `backend/src/domain/`: `User`, `Quote`, `SupportedCurrency` — plain TypeScript types/classes representing the concepts, using the monetary representation decided in [[2-1]] (never a floating-point `number` for money).
- Repositories under `backend/src/repositories/`, one per aggregate:
  - `UserRepository`: find by id, find by username, list all.
  - `SupportedCurrencyRepository`: list all, check whether a given code is supported.
  - `QuoteRepository`: create, find by id, list confirmed quotes for a user (for history), and an atomic `confirmQuote(id)` that sets `confirmed_at` only if it is currently `NULL` and reports whether it actually made the change (so a caller can tell "confirmed now" from "already confirmed" from "not found") — this is the concurrency guarantee [[business]] requires; it must rely on a single SQL statement/transaction, not a check-then-write in application code.
- All repositories go through the SQLite access set up in [[2-1]] — no raw SQL outside this layer.

## Out of scope
- Seed data (ticket 2-3)
- Session/login logic (ticket 2-4)
- Any expiry-time or spread/pricing logic — `confirmQuote` only guarantees exactly-once write; deciding whether a confirmation is still within the 10-second window is Epic 4's job
- HTTP handlers (Epic 5)

## Acceptance Criteria
- [ ] `User`, `Quote`, `SupportedCurrency` types exist in `backend/src/domain/` and are used as the return type of the corresponding repository methods
- [ ] `UserRepository`, `QuoteRepository`, `SupportedCurrencyRepository` exist in `backend/src/repositories/`, each backed by the schema from [[2-1]]
- [ ] `QuoteRepository.confirmQuote(id)` called twice concurrently (or in quick succession) on the same quote results in exactly one call reporting success and the other reporting "already confirmed" — covered by a test that exercises this concurrently (e.g. `Promise.all` of two confirm calls) against a real SQLite file, per [[backend]]'s repository-testing convention
- [ ] `QuoteRepository.confirmQuote(id)` on a non-existent id reports "not found" rather than throwing
- [ ] All repository tests run against a real SQLite database (`:memory:` or temp file), not a mocked DB layer
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 2-1 (SQLite Schema & Migrations)
