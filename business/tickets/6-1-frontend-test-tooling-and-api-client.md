# Ticket 6-1: Frontend Test Tooling, API Client Layer & Amount Formatting

## Epic
Epic 6: Frontend Application

## Context
`frontend/` is still the [[1-2]] scaffold: empty pages, no test runner, and nothing that talks to the backend. Every screen ticket after this one needs the same three things: a way to test components per [[frontend]], one typed client for the Epic 5 API, and exact conversion between the integer minor units the API sends and what a person reads or types. This ticket builds those so tickets 6-2 to 6-4 only add screens.

## Scope
- Add **Vitest + React Testing Library** to `frontend/` (e.g. `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`), with a `vitest.config.mts`, an `npm test` single-run script and a `test:watch` script. Tests are colocated with source, per [[frontend]]. The Playwright `e2e/` package is not part of this epic.
- Before writing Next.js code, read the relevant guide in `frontend/node_modules/next/dist/docs/`, per `frontend/AGENTS.md`. This Next.js version differs from older conventions.
- Backend base URL from `NEXT_PUBLIC_API_BASE_URL`, default `http://localhost:3001`. The browser calls it directly; CORS is already configured by [[5-1]]. Next.js inlines `NEXT_PUBLIC_*` at build time, so:
  - `frontend/Dockerfile` accepts it as a build `ARG` in the build stage
  - `docker-compose.yml` passes it under the frontend's `build.args`
  - it is added to the configuration table in the root `README.md`
- One API client module (e.g. `frontend/src/lib/api.ts`). It is the only place in `frontend/` that calls `fetch`, per [[frontend]]. It exposes one typed function per endpoint:
  - `login(username)` → `POST /api/login` → `{ token, user: { username } }`
  - `listCurrencies()` → `GET /api/currencies` → `{ code, name }[]`
  - `createQuote(token, { destinationCurrency, quantity })` → `POST /api/quotes` → `QuoteResponse`
  - `confirmQuote(token, id)` → `POST /api/quotes/:id/confirm` → `ConfirmedQuoteResponse`
  - `listHistory(token)` → `GET /api/quotes/history` → `HistoryItem[]`
  - Request and response types mirror `backend/src/http/quotes.ts`, `login.ts` and `currencies.ts` exactly: same field names, and every amount an integer in the same unit.
- Headers:
  - `Authorization: Bearer <token>` on the authenticated calls
  - `Content-Type: application/json` **only when a request has a body**
  - `confirmQuote` sends no body **and no `Content-Type` header**: Fastify answers a JSON content type with an empty body with `400` before the route runs
- Typed outcomes instead of thrown raw errors:
  - a non-2xx response parses [[5-1]]'s shared shape `{ error: { code, message, ...details } }` into an `ApiError` carrying `status`, `code`, `message` and any details (e.g. `maxQuantity` on `quantity_too_large`)
  - a network failure, or a body that isn't the expected JSON, becomes a distinct `network_error` outcome that screens can show a message for
  - no caller has to catch an untyped `fetch` exception
- Amount helpers (e.g. `frontend/src/lib/amounts.ts`). They do exact decimal-point shifts on integer strings, never division or multiplication producing a floating-point `number`, and never rounding (the backend already rounded, per [[business]]). Every destination currency has 2 decimal places, per DECISIONS.md Epic 2.
  - `parseQuantity(input)`: major-unit text to integer minor units (`"100"` → `10000`, `"100.5"` → `10050`, `"100.50"` → `10050`). It rejects, with a reason:
    - empty input
    - anything that isn't a plain non-negative decimal number
    - more than 2 decimal places
    - a result that isn't `Number.isSafeInteger`
    - `0`
    
    This is a UX affordance before sending, not a replacement for the backend's `invalid_quantity` / `quantity_too_large`, which the screen still handles.
  - `formatQuantity(minorUnits)`: `10050` → `"100.50"`
  - `formatBrl(centavos)`: `3144` → `"R$ 31.44"`
  - `formatUnitPrice(subUnits)`: BRL per **one** destination unit. `unitPrice` is BRL at 10^8 per destination *minor* unit, so per major unit the decimal point moves 6 places: `314375` → `"R$ 0.314375"`. Keep every significant digit (trailing zeros trimmed, never below 2 decimals). Show it exactly, not rounded.
  - `formatTimestamp(iso)`: browser-local date and time
- Draft `DECISIONS.md` entries for the user to paste in (the file is read-only):
  - the frontend test dependencies (Vitest + RTL + jsdom), and why they are justified
  - `NEXT_PUBLIC_API_BASE_URL` baked at build time and called directly from the browser, versus a Next.js proxy/rewrite
  - quantity typed in major units with at most 2 decimals and converted by string parsing, versus whole units only; unit price shown per one destination unit without rounding

## Out of scope
- Any screen, form or route content (tickets 6-2 to 6-4)
- Storing the token or any session state (ticket 6-2)
- The Playwright `e2e/` package (Epic 7)
- Any backend change (Epic 5): the client adapts to the API as it is
- Pricing, spread or rounding arithmetic of any kind, per [[frontend]]

## Acceptance Criteria
- [ ] `npm test` in `frontend/` runs Vitest once with jsdom and React Testing Library available, and exits non-zero on a failing test
- [ ] No file in `frontend/src` other than the API client module calls `fetch` (checked with a grep)
- [ ] With `fetch` stubbed in the API client's own tests, `confirmQuote(token, 42)` sends `POST <base>/api/quotes/42/confirm` with `Authorization: Bearer <token>`, **no body and no `Content-Type` header**
- [ ] `createQuote` and `login` send `Content-Type: application/json` with a JSON body; `listCurrencies` sends no `Authorization` header
- [ ] Against the running backend in Simulated Mode, a manual `login` → `createQuote` → `confirmQuote` sequence through the client module returns `200` from confirm, not `400`
- [ ] A `410` body `{ "error": { "code": "quote_expired", "message": "…" } }` gives an `ApiError` with `status 410` and `code "quote_expired"`; a `422 quantity_too_large` gives an `ApiError` exposing `maxQuantity` as an integer
- [ ] A rejected `fetch` (network down) and a `200` with a non-JSON body each give `network_error`, and neither throws out of the client function
- [ ] `parseQuantity`: `"100"` → `10000`, `"100.5"` → `10050`, `"0.01"` → `1`; `""`, `"abc"`, `"-1"`, `"1e3"`, `"100.505"`, `"0"` and `"90071992547409.92"` are each rejected
- [ ] `formatBrl(3144)` is `"R$ 31.44"`, `formatBrl(5)` is `"R$ 0.05"`, `formatQuantity(10000)` is `"100.00"`, `formatUnitPrice(314375)` is `"R$ 0.314375"`, `formatUnitPrice(500000000)` is `"R$ 500.00"`, and `formatBrl(Number.MAX_SAFE_INTEGER)` is `"R$ 90071992547409.91"`, exact
- [ ] The amount helpers contain no `/`, `*` or `toFixed` applied to amounts, and no `parseFloat`/`Number(…)` of a decimal string (reviewed in the diff)
- [ ] `NEXT_PUBLIC_API_BASE_URL` is read by the client with the `http://localhost:3001` default, and is wired into `frontend/Dockerfile`, `docker-compose.yml` and the root `README.md` configuration table
- [ ] Draft `DECISIONS.md` text for the test dependencies, the base-URL approach and the quantity input/unit-price display is handed to the user; `DECISIONS.md` itself is not edited
- [ ] `npm run lint`, `npm run format:check` and `npm run build` pass in `frontend/`

## Dependencies
Ticket 1-2 (Frontend Scaffolding & TypeScript Config), Ticket 1-3 (Linting & Formatting Standards), Ticket 5-4 (Confirm-Quote & Confirmed-Quote History Endpoints). 5-4 is the last of the Epic 5 routes the client mirrors (5-1 to 5-4).
