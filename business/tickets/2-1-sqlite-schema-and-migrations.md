# Ticket 2-1: SQLite Schema & Migrations

## Epic
Epic 2: Backend Core & Persistence

## Context
Every later ticket in this epic (domain models, repositories, seed script, session logic) and every later epic (pricing, HTTP API) needs tables to read and write. This ticket stands up the schema itself and the migration mechanism that creates it, and settles the open monetary-representation question from [[business]] before any money-bearing column is created.

## Scope
- Decide and record in `DECISIONS.md` the concrete representation for monetary values (e.g. integer cents vs. a decimal library) — per [[business]] this must not be floating-point `number`, and must not be picked silently if undecided; if truly ambiguous, ask the user first.
- Choose and set up a migration mechanism (a minimal hand-rolled runner or a small library) that applies schema changes in order and is idempotent/safe to re-run on an existing database.
- `users` table: id, unique `username`, spread (using the decided monetary/percentage representation), created_at.
- `supported_currencies` table: currency code (PK, one of `EUR`, `ARS`, `COP`, `MXN`, `ZAR`), plus any descriptive columns needed later — no pair strings, no exchange-specific data (pair resolution is Epic 3's job).
- `quotes` table: id, user_id (FK to users), destination currency, quantity, unit price, total price (all money columns in the decided representation), created_at, expires_at, confirmed_at (nullable). Design the `confirmed_at` column/constraint so a repository can later confirm a quote atomically (e.g. a single `UPDATE ... WHERE confirmed_at IS NULL` guarded by the column's nullability) — implementing the confirm operation itself is ticket 2-2.
- A `npm run migrate` (or equivalent) script that applies migrations against the configured SQLite file.

## Out of scope
- Domain model types and repositories (ticket 2-2)
- Seed data (ticket 2-3)
- Session/login table and logic (ticket 2-4)
- Pricing, spread calculation, or quote-lifecycle business rules (Epic 4)
- Any HTTP endpoint (Epic 5)

## Acceptance Criteria
- [ ] `DECISIONS.md` records the chosen monetary representation and why (or the user was asked and their answer is recorded)
- [ ] Running the migration script against a fresh SQLite file creates `users`, `supported_currencies`, and `quotes` with the columns above
- [ ] Running the migration script twice against the same file does not error or duplicate schema objects
- [ ] `quotes.user_id` has a foreign key constraint to `users.id`
- [ ] `supported_currencies` can only hold the five spec'd currency codes (enforced via CHECK constraint, enum-like column, or equivalent — not left to application code alone)
- [ ] No monetary column uses a floating-point-backed SQLite type in a way that loses precision (verified by a test that writes and reads back a value with cents that would be lossy under float rounding)
- [ ] Tests (Vitest, colocated per [[testing]]) cover: migration runs cleanly, migration is idempotent, and the currency CHECK/constraint rejects an unsupported code

## Dependencies
Ticket 1-1 (Backend Scaffolding & TypeScript Config)
