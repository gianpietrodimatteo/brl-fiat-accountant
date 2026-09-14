# BRL/Fiat Accountant

## Prerequisites

- Docker and Docker Compose

## Running the stack

From the repository root:

```bash
docker compose up
```

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

### Configuration

The following environment variables can be overridden (e.g. via a `.env` file at the repo
root, or exported in your shell) before running `docker compose up`:

| Variable                   | Default                 | Description                                                                         |
| -------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| `BACKEND_PORT`             | `3001`                  | Port the backend listens on and is exposed at                                       |
| `FRONTEND_PORT`            | `3000`                  | Port the frontend listens on and is exposed at                                      |
| `SQLITE_DB_PATH`           | `/data/app.db`          | Path (inside the backend container) to the SQLite database file                     |
| `CORS_ORIGIN`              | `http://localhost:3000` | The one browser origin (the frontend) allowed to call the backend API               |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | Backend URL the browser calls; baked in at build time (`docker compose up --build`) |

## Development (without Docker)

Each app can also be run directly with `npm run dev` from `backend/` or `frontend/` — see
[backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for
per-app setup, scripts, and (for the backend) database instructions. This requires
Node.js 24.
