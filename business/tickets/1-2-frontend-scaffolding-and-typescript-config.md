# Ticket 1-2: Frontend Scaffolding & TypeScript Config

## Epic
Epic 1: Project Setup & Tooling

## Context
Per `DECISIONS.md`, the frontend will be a Next.js + TypeScript app that only talks to the backend over HTTP. The `frontend/` folder is currently empty; Epic 6 (screens) needs a working Next.js project to build the three screens into.

## Scope
- Initialize a Next.js project (TypeScript template) under `frontend/`
- Configure `frontend/tsconfig.json` with strict mode enabled
- Set up baseline routing/folder structure for three future pages (login, quotation, history) as empty/placeholder routes — no real content or API calls
- Add `dev`/`build`/`start` scripts using the same package manager chosen in ticket 1-1
- Confirm the placeholder app builds and serves a blank page locally

## Out of scope
- Any real screen content, forms, or API integration (Epic 6)
- Backend scaffolding (ticket 1-1)
- Docker packaging (ticket 1-4)

## Acceptance Criteria
- [ ] `frontend/package.json` and `frontend/tsconfig.json` exist and are valid
- [ ] `npm install` succeeds from a clean clone
- [ ] `npm run build` produces a successful Next.js production build with no TypeScript errors
- [ ] `npm run dev` serves placeholder routes for login, quotation, and history without runtime errors
- [ ] Package manager and script names are consistent with ticket 1-1's conventions

## Dependencies
Ticket 1-1 (Backend Scaffolding & TypeScript Config) — for the shared package manager decision
