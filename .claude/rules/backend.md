# Backend Conventions

Applies to everything under `backend/`. See [[business]] for the domain rules this code
must implement correctly.

## Runtime & TypeScript

- Node 24 (see `backend/.nvmrc`), TypeScript with `strict: true`, CommonJS output
  (`backend/tsconfig.json`). Don't relax compiler strictness to make something compile —
  fix the types instead.
- Dev loop is `tsx watch src/index.ts` (`npm run dev`); production build is `tsc` → `dist/`.

## Folder structure

Keep transport, domain logic, and persistence in separate layers under `backend/src/`
(introduce these as they're needed, don't scaffold empty folders speculatively):

- `http/` or `routes/` — request parsing/validation and response shaping only.
- `domain/` or `services/` — business rules: pricing, spread, rounding, quote lifecycle.
- `repositories/` or `data/` — SQLite access, one repository per aggregate (User, Quote,
  SupportedCurrency).
- `exchanges/` — Binance/OKX clients and the simulated-mode fakes, behind a shared
  interface so both are swappable.

Route/controller handlers must stay thin: parse input, call a service, shape the response.
Never compute prices, spreads, or rounding inline in a route handler, and never let a route
handler talk to SQLite or an exchange client directly — always go through a service/repository.

## Error handling

- Exchange/network failures (timeouts, malformed responses, connection drops) must be
  caught at the client boundary and turned into typed domain results (e.g. an
  "unavailable" outcome), never left as raw exceptions that reach the HTTP layer as a
  generic 500.
- All endpoints share one consistent error response shape — don't invent a new error
  format per route.

## Persistence

- SQLite, accessed only through repositories — no raw SQL scattered across services.

## Lint/format

- `npm run lint` (ESLint flat config: `@eslint/js` recommended + `typescript-eslint`
  recommended + `eslint-config-prettier`) and `npm run format:check` (Prettier, root
  `.prettierrc.json`) must both pass before a backend ticket is done.

## Testing

- No test runner is configured yet. If a ticket introduces logic worth unit testing,
  check `DECISIONS.md`/`package.json` for an already-chosen framework before adding one —
  don't pick silently.
