# Ticket 1-4: Docker Compose Setup

## Epic
Epic 1: Project Setup & Tooling

## Context
`DECISIONS.md` commits to running SQLite via Docker for ease of use and scaling. This ticket makes the whole app (backend + frontend + persisted SQLite data) runnable with a single `docker compose up`, which every later epic and the final delivery (Epic 7) relies on for local verification.

## Scope
- `backend/Dockerfile` building and running the backend placeholder app
- `frontend/Dockerfile` building and running the Next.js placeholder app
- Root `docker-compose.yml` wiring backend and frontend services together
- A named volume (or bind mount) so the SQLite database file persists across container restarts
- Environment variable wiring for backend port, frontend port, and SQLite file path
- A documented single command to bring the whole stack up

## Out of scope
- Actual SQLite schema/migrations (Epic 2)
- CI/CD pipelines
- Production-grade image hardening (multi-stage optimization, non-root users) beyond basic good practice

## Acceptance Criteria
- [ ] `docker compose up` builds and starts both backend and frontend containers successfully
- [ ] Backend container exposes its port and stays running (no crash loop) on the placeholder code
- [ ] Frontend container exposes its port and serves the placeholder pages
- [ ] Restarting the containers does not lose data written to the SQLite volume (verified with a throwaway test file/write)
- [ ] Compose file and Dockerfiles are documented in `README.md` setup steps (or a placeholder note if `README.md` doesn't exist yet)

## Dependencies
Ticket 1-1 (Backend Scaffolding & TypeScript Config), Ticket 1-2 (Frontend Scaffolding & TypeScript Config)
