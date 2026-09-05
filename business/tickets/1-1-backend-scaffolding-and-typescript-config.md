# Ticket 1-1: Backend Scaffolding & TypeScript Config

## Epic
Epic 1: Project Setup & Tooling

## Context
The backend has no code yet — only an empty `backend/` folder. Every later epic (persistence, market data, business logic, HTTP API) needs a running TypeScript project to build into, so this has to land first.

## Scope
- Choose and document a package manager (npm/pnpm/yarn) in `DECISIONS.md`
- Initialize `backend/package.json` with the chosen package manager
- Add `backend/tsconfig.json` with strict mode enabled, targeting a current Node LTS
- Create baseline backend folder structure (e.g. `src/`, entry point) with no business logic — a placeholder that starts and exits cleanly
- Add `npm run build` / `npm run dev` (or equivalent) scripts
- Pin Node version (e.g. `.nvmrc` or `engines` field in `package.json`)

## Out of scope
- Any HTTP server, routes, or domain logic (Epic 5)
- Database setup (Epic 2)
- Frontend scaffolding (ticket 1-2)
- Docker packaging (ticket 1-4)

## Acceptance Criteria
- [ ] `backend/package.json` and `backend/tsconfig.json` exist and are valid
- [ ] `npm install` (or chosen package manager's install) succeeds from a clean clone
- [ ] A build script compiles the placeholder entry point with no TypeScript errors
- [ ] A dev/run script starts the placeholder process and it exits/runs without crashing
- [ ] Package manager choice and rationale are recorded in `DECISIONS.md`

## Dependencies
None
