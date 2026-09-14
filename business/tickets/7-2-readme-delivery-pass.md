# Ticket 7-2: README Delivery Pass

## Epic
Epic 7: Documentation & Delivery

## Context
The challenge requires a `README.md` explaining how to run the project, including Simulated Mode. Today the root README covers Docker Compose but never mentions `EXCHANGE_MODE`, even though `docker-compose.yml` already passes it through (default `live`). The activation instructions exist only in `backend/README.md`, as ticket 3-4 intended until this pass. `frontend/README.md` is still the create-next-app boilerplate ("Learn More", "Deploy on Vercel").

## Scope
- Root `README.md`:
  - A short intro saying what the app does (one paragraph, consistent with `CLAUDE.md`).
  - Prerequisites: Docker/Compose for the stack, Node.js 24 for running without Docker and for the e2e suite.
  - **Simulated Mode** section, visible from the top of the README (e.g. linked from a short contents list or placed right after "Running the stack"). Cover:
    - how to start it with Docker: `EXCHANGE_MODE=simulated docker compose up`, or a `.env` entry
    - how to start it without Docker (`EXCHANGE_MODE=simulated npm run dev` in `backend/`)
    - that it makes zero network calls to the exchanges
    - that an invalid value fails at startup rather than silently falling back
    - that switching modes doesn't need a rebuild
  - Add `EXCHANGE_MODE` to the root configuration table.
  - A "Using the app" section: the seeded users (`alice` 0%, `bob` 0.6%, `carol` 1%), the supported currencies, the three screens, the 10-second validity, and that there is no password by design.
  - A "Tests" section: how to run the backend, frontend and e2e ([[7-1]]) suites, linking to the per-package READMEs rather than repeating them.
  - A short repository layout (`backend/`, `frontend/`, `e2e/`, `business/`, `DECISIONS.md`).
- `frontend/README.md`: replace the create-next-app boilerplate with project-specific content: setup, scripts, configuration (`NEXT_PUBLIC_API_BASE_URL`), tests. Keep only what is true for this app.
- `backend/README.md`: correct only what is stale or now contradicts the root README. It stays the API/database reference.

## Out of scope
- Duplicating the HTTP API reference or the database documentation in the root README (link to `backend/README.md` instead)
- Changes to `DECISIONS.md` (read-only; its review is ticket 7-4)
- Any code or configuration change. If following the README exposes a gap in `docker-compose.yml` or the apps, report it to the user instead of fixing it here.
- The manual live-mode checklist (ticket 7-3)

## Acceptance Criteria
- [ ] Root `README.md` has a Simulated Mode section reachable from the top of the file. It shows the exact Docker and non-Docker commands and states the `live` default and the startup failure on invalid values
- [ ] `EXCHANGE_MODE` appears in the root configuration table with default `live` and allowed values `live`/`simulated`
- [ ] Following the root README verbatim on a fresh clone, `EXCHANGE_MODE=simulated docker compose up --build` brings up the stack. Logging in as `alice` at http://localhost:3000, creating a quote, confirming it and opening history all work
- [ ] The root README lists the three seeded users with their spreads and the five supported currencies, and these match the seed data in `backend/`
- [ ] The root README says how to run each test suite (backend, frontend, e2e), and every command it gives works as written
- [ ] `frontend/README.md` no longer contains create-next-app boilerplate (no "Learn More" or "Deploy on Vercel" sections) and documents `NEXT_PUBLIC_API_BASE_URL`
- [ ] Every relative link in the three READMEs resolves to an existing file or heading
- [ ] `npx prettier --check` passes on the changed Markdown files
- [ ] `git diff` touches only Markdown files

## Dependencies
Ticket 7-1 (Playwright E2E Suite in Simulated Mode), so the Tests section documents a suite that exists. Ticket 3-4 (Simulated Mode Exchange Fakes).
