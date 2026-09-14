# BRL/Fiat Accountant

## Prerequisites

- Docker and Docker Compose

## Running the stack

From the repository root:

```bash
docker compose up
```

> [!IMPORTANT]
> **This starts the app in live mode, which calls the real Binance and OKX APIs.** To run
> without any network access to the exchanges, start it in [Simulated Mode](#simulated-mode).

This builds and starts both services:

- **backend** — http://localhost:3001 (Fastify HTTP API)
- **frontend** — http://localhost:3000 (Next.js app)

On startup the backend applies any pending database migrations and seeds the pre-defined
users and supported currencies before it accepts requests, so a fresh `docker compose up`
needs no manual database steps. Both steps are idempotent: restarting adds no duplicate rows.

The SQLite database file is persisted in a named Docker volume (`sqlite-data`), mounted at
`/data` in the backend container, so data survives container restarts. See
[backend/README.md](backend/README.md#database) for the schema, migrations, seeding, and
how to inspect the database directly (locally or inside the container).

## Simulated Mode

The backend has two exchange modes, chosen with the `EXCHANGE_MODE` environment variable:

| `EXCHANGE_MODE`  | What the backend talks to                                                      |
| ---------------- | ------------------------------------------------------------------------------ |
| `live` (default) | The real Binance REST API and OKX WebSocket (with OKX REST fallback)           |
| `simulated`      | Local fakes with fixed in-memory prices — **no network calls to any exchange** |

In Simulated Mode the whole app works normally: login, quote creation, confirmation,
expiration and history. Only the prices are simulated.

### Turning it on

With Docker, from the repository root:

```bash
EXCHANGE_MODE=simulated docker compose up
```

Or add this line to a `.env` file at the repository root, so plain `docker compose up` uses it:

```
EXCHANGE_MODE=simulated
```

Without Docker, from `backend/`:

```bash
EXCHANGE_MODE=simulated npm run dev
```

### Things to know

- **Leaving it unset means `live`.** You have to ask for Simulated Mode explicitly.
- **The mode is read once, at startup.** To switch, restart the backend with the new value.
  With Docker, `docker compose up` recreates the backend container when the value changes. No
  `--build` is needed because the variable isn't baked into the image.
- **A typo is a startup error, not a silent fallback.** Any value other than `live` or
  `simulated` (e.g. `simulate`) stops the backend from starting, so a mistyped toggle can never
  quietly call the real exchanges.
- **Check which mode is running** in the backend's startup log:
  `docker compose logs backend | grep "exchange mode"` prints `exchange mode: simulated` or
  `exchange mode: live`.
- **Both modes share one database.** Quotes confirmed in Simulated Mode stay in the history
  after you switch to live mode, and the other way round, because both use the same
  `sqlite-data` volume.

The frontend needs no configuration for either mode. See
[backend/README.md](backend/README.md#simulated-mode) for how the fakes are wired.

## Configuration

The following environment variables can be overridden (e.g. via a `.env` file at the repo
root, or exported in your shell) before running `docker compose up`:

| Variable                   | Default                 | Description                                                                         |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `BACKEND_PORT`             | `3001`                  | Port the backend listens on and is exposed at                                       |
| `FRONTEND_PORT`            | `3000`                  | Port the frontend listens on and is exposed at                                      |
| `EXCHANGE_MODE`            | `live`                  | `live` or `simulated` — see [Simulated Mode](#simulated-mode)                       |
| `SQLITE_DB_PATH`           | `/data/app.db`          | Path (inside the backend container) to the SQLite database file                     |
| `CORS_ORIGIN`              | `http://localhost:3000` | The one browser origin (the frontend) allowed to call the backend API               |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | Backend URL the browser calls; baked in at build time (`docker compose up --build`) |

## Development (without Docker)

Each app can also be run directly with `npm run dev` from `backend/` or `frontend/` — see
[backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for
per-app setup, scripts, and (for the backend) database instructions. This requires
Node.js 24.
