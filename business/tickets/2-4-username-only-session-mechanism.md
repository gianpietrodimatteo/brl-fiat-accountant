# Ticket 2-4: Username-Only Login & Session Mechanism

## Epic
Epic 2: Backend Core & Persistence

## Context
[[business]] requires username-only login with no password, registration, or recovery — deliberately, per the challenge spec. This ticket builds the underlying session domain logic and persistence so that Epic 5's HTTP layer can later expose it as an endpoint without containing any of this logic itself, per [[backend]]'s "route handlers stay thin" convention.

## Scope
- A `sessions` table (own migration, added the same way as [[2-1]]'s migrations): session id/token, user_id (FK to `users`), created_at.
- A `SessionRepository` under `backend/src/repositories/`: create a session for a user, find a session by token.
- A `SessionService` (or equivalent) under `backend/src/domain/` or `backend/src/services/`:
  - `login(username)`: looks up the user via `UserRepository`; if the username doesn't exist, returns a typed "not found" result (never throws for this expected case); if it exists, creates and returns a session.
  - `getUserForSession(token)`: resolves a session token back to its `User`, or a typed "invalid/not found" result.
- No password field, no registration flow, no account-recovery flow anywhere in this ticket's code.

## Out of scope
- The HTTP `/login` endpoint, cookies, headers, or any transport concern (Epic 5)
- Seed data (ticket 2-3, though this ticket's tests will use seeded-style users)
- Session expiry/logout — not called for by the challenge spec; do not add it speculatively

## Acceptance Criteria
- [ ] `SessionRepository` and `SessionService` exist and go through the repositories from [[2-2]] — no raw SQL, no direct DB access outside the repository layer
- [ ] `login("alice")` (or any existing username) creates a session row and returns it linked to the correct user
- [ ] `login("nonexistent")` returns a typed failure result, not a thrown exception
- [ ] `getUserForSession(token)` returns the correct `User` for a valid, previously created token
- [ ] `getUserForSession(token)` returns a typed failure result for an unknown or malformed token
- [ ] No code path in this ticket references a password field or a registration/recovery concept
- [ ] Tests (Vitest, real SQLite per [[backend]]) cover all the above cases
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 2-2 (Domain Models & Repository Layer)
