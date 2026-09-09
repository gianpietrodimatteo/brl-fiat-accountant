# BRL/Fiat Accountant

## Prerequisites

- Docker and Docker Compose

## Running the stack

From the repository root:

```bash
docker compose up
```

This builds and starts both services:

- **backend** — http://localhost:3001 (placeholder HTTP server)
- **frontend** — http://localhost:3000 (Next.js app)

The SQLite database file is persisted in a named Docker volume (`sqlite-data`), mounted at
`/data` in the backend container, so data survives container restarts. Actual SQLite
schema/usage is implemented in a later epic; this setup only wires the volume and path.

### Configuration

The following environment variables can be overridden (e.g. via a `.env` file at the repo
root, or exported in your shell) before running `docker compose up`:

| Variable         | Default        | Description                                   |
| ---------------- | -------------- | ---------------------------------------------- |
| `BACKEND_PORT`   | `3001`         | Port the backend listens on and is exposed at |
| `FRONTEND_PORT`  | `3000`         | Port the frontend listens on and is exposed at |
| `SQLITE_DB_PATH` | `/data/app.db` | Path (inside the backend container) to the SQLite database file |

## Development (without Docker)

Each app can also be run directly with `npm run dev` from `backend/` or `frontend/`
(see [frontend/README.md](frontend/README.md) for the frontend). This requires Node.js 24.
