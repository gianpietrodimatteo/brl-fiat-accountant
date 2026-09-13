# Ticket 5-1: Fastify Server Bootstrap, Composition Root & Error Response Shape

## Epic
Epic 5: HTTP API

## Context
`backend/src/index.ts` is still the scaffolding placeholder: nothing opens the database, applies migrations, seeds, starts the OKX feed from [[3-2]], or builds the services from Epics 2–4. This ticket builds the real server those services run in, plus the pieces every later route shares — one error response shape and CORS for the frontend — so tickets 5-2 to 5-4 only have to add routes.

## Scope
- Add Fastify as the HTTP layer, plus `@fastify/cors`. Keep `node:http` out of `index.ts` from now on.
- An app factory (e.g. `buildApp(deps)` under `backend/src/http/`) that takes its dependencies (database handle, exchange clients, clock) and returns a Fastify instance without listening. Tests use it with `app.inject()` against an in-memory SQLite database and the Simulated Mode fakes from [[3-4]], per [[backend]].
- A composition root in `index.ts`:
  - open the database via `openDatabase()`
  - apply migrations with the existing runner, then run `seedDatabase` (already idempotent) so a fresh `docker compose up` needs no manual steps
  - get the clients from `getExchangeClients()`, and call `start()` on the OKX client when it is the live `OkxClient`, without `index.ts` special-casing Simulated Mode beyond what `exchangeClients.ts` already exposes
  - build `SessionService`, `MarketDataService` and `QuoteService` from their repositories
  - listen on `PORT` (default `3001`)
- Graceful shutdown on `SIGINT`/`SIGTERM`: close the Fastify server, stop the OKX client, close the database.
- One error response shape for every non-2xx response:
  `{ "error": { "code": "<snake_case_machine_code>", "message": "<human-readable text>" } }`.
  Wire it through Fastify's `setErrorHandler` and `setNotFoundHandler`, so schema-validation failures (`400`, code `validation_error`), unknown routes (`404`, code `not_found`) and unexpected exceptions (`500`, code `internal_error`) all use it. A `500` never leaks a stack trace or the internal error message.
- Configure the JSON-schema validator so it never coerces types. Fastify's default Ajv setup coerces, turning `"10000"` into `10000`, and later tickets rely on a string being rejected.
- CORS allows the frontend origin from a `CORS_ORIGIN` env var (default `http://localhost:3000`), including the `Authorization` header on preflight. Add `CORS_ORIGIN` to `docker-compose.yml` and to the configuration table in the root `README.md`.
- Update the root `README.md`, which still calls the backend a "placeholder HTTP server", and `backend/README.md` so they say migrations and seeding run on startup.
- Draft `DECISIONS.md` entries for the user to paste in (the file is read-only):
  - Fastify, with the rejected alternatives: Express, plain `node:http`, Hono
  - `@fastify/cors` as a dependency
  - migrate and seed on startup, versus manual steps

## Out of scope
- Any business route: login, currencies, quotes, history (tickets 5-2 to 5-4)
- Session/auth resolution (ticket 5-2)
- Changes to services, repositories, pricing or exchange clients (Epics 2–4)
- Frontend API client (Epic 6)

## Acceptance Criteria
- [ ] `npm run dev` and the Docker image both start a Fastify server on `PORT` that applies pending migrations and seeds users and currencies before accepting requests; starting twice against the same database file adds no duplicate rows
- [ ] On a fresh database (e.g. a new Docker volume), `alice`, `bob`, `carol` and the five supported currencies exist after startup with no manual `npm run migrate`/`npm run seed`
- [ ] With `EXCHANGE_MODE=simulated` the process opens no network connection to Binance or OKX; with `live` the OKX client's `start()` has been called once by the time the server is listening
- [ ] `SIGTERM` closes the server, stops the OKX client and closes the database, and the process exits with code 0
- [ ] `buildApp` can be constructed in a test with an in-memory database and the Simulated Mode fakes, with no network and without calling `listen`
- [ ] A request to an unknown route returns `404` with body `{ "error": { "code": "not_found", "message": <string> } }`
- [ ] A route that throws an unexpected error (registered in the test only) returns `500` with code `internal_error`, and the response body contains neither the thrown message nor a stack trace
- [ ] A schema-validation failure (test-only route with a body schema) returns `400` with code `validation_error` in the shared shape, and a string `"10000"` sent for an `integer` field is rejected, not coerced
- [ ] A CORS preflight from `CORS_ORIGIN` asking to send `Authorization` is allowed; a preflight from any other origin gets no `Access-Control-Allow-Origin` for it
- [ ] `docker-compose.yml`, the root `README.md` and `backend/README.md` mention `CORS_ORIGIN` and startup migrate/seed; no remaining text calls the backend a placeholder
- [ ] Draft `DECISIONS.md` text for Fastify, `@fastify/cors` and startup migrate/seed is handed to the user; `DECISIONS.md` itself is not edited
- [ ] Tests (Vitest, colocated per [[backend]]) cover the error shape, the no-coercion rule and CORS through `app.inject()`
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 2-3 (Seed Script), Ticket 3-4 (Simulated Mode Fakes), Ticket 4-4 (Quote Confirmation & History) — all services this ticket wires together must exist
