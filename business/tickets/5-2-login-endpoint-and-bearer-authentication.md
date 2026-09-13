# Ticket 5-2: Login Endpoint & Bearer-Token Authentication

## Epic
Epic 5: HTTP API

## Context
[[2-4]] built username-only login and session lookup as a service. This ticket puts it on the wire: a login route that returns a session token, and one reusable authentication step that turns `Authorization: Bearer <token>` into the calling user for every protected route in 5-3 and 5-4. Per [[business]], there is no password, registration or recovery. That is deliberate, not a gap to fill.

## Scope
- `POST /api/login` with JSON body `{ "username": string }`, validated by a Fastify JSON schema: required, non-empty string, no extra properties.
  - Success → `200` with `{ "token": string, "user": { "username": string } }`.
  - Unknown username (`SessionService.login` → `user_not_found`) → `401`, code `invalid_username`, in [[5-1]]'s error shape.
- A single authentication hook or plugin (e.g. a Fastify `preHandler` plus a typed request decoration such as `request.user`) that:
  - reads `Authorization: Bearer <token>`
  - resolves it via `SessionService.getUserForSession`
  - rejects a missing header, a non-`Bearer` scheme, an empty token or an unknown token with `401`, code `unauthorized`
- Protected routes opt in to this one hook; no route re-implements header parsing.
- The handler stays thin, per [[backend]]: parse, call `SessionService`, shape. No SQL, no user lookup of its own.
- Draft a `DECISIONS.md` entry for the user to paste in: the bearer token in the `Authorization` header with CORS, and the rejected alternative of an HttpOnly cookie behind a Next.js proxy or credentialed CORS.

## Out of scope
- Any password, registration, recovery, logout or session-expiry mechanism: forbidden by [[business]], and expiry was already ruled out in [[2-4]]
- Rate limiting or brute-force protection on login (not a security mechanism the spec wants)
- Currencies, quote and history routes (tickets 5-3, 5-4)
- Storing the token on the client (Epic 6)

## Acceptance Criteria
- [ ] `POST /api/login` with `{ "username": "alice" }` returns `200` with a non-empty `token` and `user.username === "alice"`, and a session row now exists for alice
- [ ] Logging in twice as the same user returns two different tokens, and both authenticate
- [ ] `POST /api/login` with `{ "username": "mallory" }` returns `401`, code `invalid_username`, and creates no session row
- [ ] A missing body, a missing `username`, an empty string, a non-string `username` (e.g. `123`) and an extra property each return `400`, code `validation_error`
- [ ] The login response and request schema contain no password field of any kind
- [ ] A test-only protected route behind the auth hook returns `401`, code `unauthorized`, for: no `Authorization` header, `Authorization: Basic …`, `Authorization: Bearer ` with an empty token, and an unknown token
- [ ] The same test route, called with a token from `POST /api/login`, sees the correct user (e.g. alice's id and spread) on the request
- [ ] Every `401` above uses [[5-1]]'s shared error shape
- [ ] Draft `DECISIONS.md` text for bearer token + CORS versus cookie is handed to the user; `DECISIONS.md` itself is not edited
- [ ] Tests (Vitest, colocated per [[backend]]) run through `app.inject()` against a real in-memory SQLite database seeded with the standard users
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 5-1 (Fastify Server Bootstrap, Composition Root & Error Response Shape), Ticket 2-4 (Username-Only Login & Session Mechanism)
