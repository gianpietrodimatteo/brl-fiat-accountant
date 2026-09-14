# Backend

Node/TypeScript backend for the BRL/Fiat Accountant. See the [repo root README](../README.md)
for how to run the whole stack with Docker Compose.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- npm

## Setup

```bash
cd backend
npm install
```

## Scripts

| Script                 | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Runs the server with `tsx watch` (auto-restarts on change)  |
| `npm run build`        | Type-checks and compiles to `dist/` via `tsc`               |
| `npm start`            | Runs the compiled server (`node dist/index.js`)             |
| `npm run lint`         | ESLint                                                      |
| `npm run format`       | Prettier, writes fixes                                      |
| `npm run format:check` | Prettier, check only                                        |
| `npm run migrate`      | Applies any pending SQLite migrations (also run on startup) |
| `npm run seed`         | Seeds users and supported currencies (also run on startup)  |
| `npm test`             | Runs the Vitest suite once                                  |
| `npm run test:watch`   | Runs Vitest in watch mode                                   |

## Running the server

`npm run dev` (or `npm start` after a build, or the Docker image) starts a Fastify HTTP server.
On startup it:

1. opens the SQLite database (see [Database](#database))
2. applies any pending migrations, then seeds the pre-defined users and supported currencies —
   both idempotent, so no manual `npm run migrate` / `npm run seed` is needed and restarting
   against the same file adds no duplicate rows
3. opens the OKX price feed (live mode only; see [Simulated Mode](#simulated-mode))
4. listens on `PORT`

`SIGINT`/`SIGTERM` shut it down gracefully: the HTTP server closes, the OKX feed stops and the
database is closed before the process exits with code `0`.

### Configuration

| Variable         | Default                 | Description                                                   |
| ---------------- | ----------------------- | ------------------------------------------------------------- |
| `PORT`           | `3001`                  | Port the server listens on (all interfaces)                   |
| `CORS_ORIGIN`    | `http://localhost:3000` | The one browser origin (the frontend) allowed to call the API |
| `SQLITE_DB_PATH` | `data/app.db`           | SQLite database file (see [Location](#location))              |
| `EXCHANGE_MODE`  | `live`                  | `live` or `simulated` (see [Simulated Mode](#simulated-mode)) |

CORS answers only `CORS_ORIGIN`, and allows it to send the `Authorization` and `Content-Type`
headers.

### Error responses

Every non-2xx response has the same body:

```json
{ "error": { "code": "validation_error", "message": "body/quantity must be integer" } }
```

`code` is a stable snake_case value for clients to branch on; `message` is for humans. The
shared codes are `validation_error` (`400`, the request failed its JSON schema), `not_found`
(`404`, unknown route) and `internal_error` (`500`, which never includes the internal error's
message or a stack trace). Other request errors Fastify raises itself keep their status and
take a code from it, e.g. `bad_request` (malformed JSON), `unsupported_media_type` or
`payload_too_large`.

JSON request bodies are validated without type coercion: `"10000"` sent for an integer field is
rejected, not turned into `10000`. Route params and query strings, which only ever arrive as
text, are still coerced to the types their schema declares.

## Simulated Mode

Simulated Mode swaps both exchange clients for local fakes that answer from hardcoded,
plausible in-memory prices and make no network calls at all — no Binance REST request and no
OKX WebSocket connection. It is selected by the `EXCHANGE_MODE` env var, read once at process
start:

| `EXCHANGE_MODE` | Clients used                            |
| --------------- | --------------------------------------- |
| unset (default) | Real `BinanceClient` and `OkxClient`    |
| `live`          | Real `BinanceClient` and `OkxClient`    |
| `simulated`     | `FakeBinanceClient` and `FakeOkxClient` |

Run the backend in Simulated Mode locally:

```bash
EXCHANGE_MODE=simulated npm run dev
```

Or with Docker Compose, from the repo root:

```bash
EXCHANGE_MODE=simulated docker compose up
```

Any other value (a typo such as `simulate`) fails at startup rather than silently falling back
to the real exchanges. The active mode is logged on startup.

## Database

SQLite, accessed only through the repository layer (`src/repositories/`) — see
[`.claude/rules/backend.md`](../.claude/rules/backend.md) for the conventions.

### Location

The database is a single file. Its path is controlled by the `SQLITE_DB_PATH` env var:

- Running locally (`npm run dev`, `npm run migrate`, `npm test`, etc.): defaults to
  `backend/data/app.db`. This path is gitignored.
- Running in Docker: set to `/data/app.db` inside the container by `docker-compose.yml`,
  which lives on the named volume `sqlite-data` (not a host bind mount).
- Vitest tests don't touch this file at all — they run against an in-memory database
  (`:memory:`) created fresh per test file, or a throwaway file in the OS temp directory when
  a test needs to reopen the same database.

### Migrations

Migrations are plain SQL, one file per migration under `src/db/migrations/`, applied in
order and tracked in an internal `_migrations` table so re-running is a no-op. The server
applies pending migrations itself on every startup; to apply them without starting it, run:

```bash
npm run migrate
```

To add a new migration, add a new `NNNN_name.ts` file in `src/db/migrations/` (see
`0001_init.ts` / `0002_sessions.ts` for the shape) and register it in
`src/db/migrations/index.ts`.

### Seeding

```bash
npm run seed
```

Inserts the pre-defined users (`alice`, `bob`, `carol`) and supported currencies. Safe to
re-run — existing rows are left alone (`INSERT OR IGNORE`). The server runs the seed itself on
every startup, right after migrations, so this script is only needed to seed without starting
it.

### Inspecting the database

**Locally**, open the file directly with the `sqlite3` CLI (or a GUI tool like
[DB Browser for SQLite](https://sqlitebrowser.org/) or a VS Code SQLite extension):

```bash
sqlite3 backend/data/app.db
```

Useful commands once inside the prompt:

```
.tables                     -- list tables
.schema users                -- show a table's schema
SELECT * FROM users;
.quit
```

Or run a one-off query without an interactive session:

```bash
sqlite3 backend/data/app.db "SELECT * FROM users;"
```

**In Docker**, the file lives on the `sqlite-data` volume, not on your host filesystem.
Query it inside the running container:

```bash
docker compose exec backend sqlite3 /data/app.db
```

If the container image doesn't have `sqlite3` installed, copy the file out first:

```bash
docker compose cp backend:/data/app.db ./app.db
sqlite3 ./app.db
```

### Schema

- `users` — pre-seeded, username-only accounts with a per-user spread (`spread`, integer
  basis points).
- `supported_currencies` — the fixed set of destination currencies (`EUR`, `ARS`, `COP`,
  `MXN`, `ZAR`).
- `quotes` — a user's expirable currency quote (amounts stored as integer BRL centavos, per
  `DECISIONS.md`).
- `sessions` — username-only login sessions (opaque `token`, linked to a `user_id`); no
  password/expiry/recovery.

## Testing

Vitest, colocated with source (`Foo.ts` + `Foo.test.ts`). Repository/service tests run
against a real in-memory SQLite database rather than mocks. See
[`.claude/rules/backend.md`](../.claude/rules/backend.md) for the full testing conventions.

```bash
npm test
```
