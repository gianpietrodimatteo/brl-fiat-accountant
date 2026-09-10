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

| Script                 | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Runs the server with `tsx watch` (auto-restarts on change) |
| `npm run build`        | Type-checks and compiles to `dist/` via `tsc`              |
| `npm start`            | Runs the compiled server (`node dist/index.js`)            |
| `npm run lint`         | ESLint                                                     |
| `npm run format`       | Prettier, writes fixes                                     |
| `npm run format:check` | Prettier, check only                                       |
| `npm run migrate`      | Applies any pending SQLite migrations                      |
| `npm run seed`         | Seeds users and supported currencies                       |
| `npm test`             | Runs the Vitest suite once                                 |
| `npm run test:watch`   | Runs Vitest in watch mode                                  |

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
  (`:memory:`) created fresh per test file.

### Migrations

Migrations are plain SQL, one file per migration under `src/db/migrations/`, applied in
order and tracked in an internal `_migrations` table so re-running is a no-op. Apply any
pending migrations with:

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
re-run — existing rows are left alone (`INSERT OR IGNORE`).

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
