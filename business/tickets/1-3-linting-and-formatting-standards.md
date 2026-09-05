# Ticket 1-3: Linting & Formatting Standards

## Epic
Epic 1: Project Setup & Tooling

## Context
`DECISIONS.md` commits to "proven default standards" for coding conventions. With backend and frontend projects scaffolded, this ticket locks in shared ESLint/Prettier rules so every subsequent ticket produces consistently styled, lint-clean TypeScript.

## Scope
- Add ESLint config for `backend/` (TypeScript-aware rules)
- Add ESLint config for `frontend/` (TypeScript + React/Next.js rules)
- Add a shared Prettier config used by both projects (single source of truth, e.g. a root `.prettierrc`)
- Add `lint` and `format` scripts to both `backend/package.json` and `frontend/package.json`
- Resolve any conflicts between ESLint and Prettier rule sets (e.g. `eslint-config-prettier`)
- Document the chosen tools and any deviation from defaults in `DECISIONS.md`

## Out of scope
- Pre-commit hooks or CI enforcement (no CI/CD required per Epic 1's Out of scope)
- Rewriting/linting business logic that doesn't exist yet

## Acceptance Criteria
- [ ] `npm run lint` succeeds with zero errors on both the backend and frontend placeholder code
- [ ] `npm run format` (or equivalent) applies Prettier formatting consistently across both projects
- [ ] Running lint/format twice in a row produces no further changes (idempotent)
- [ ] Root-level Prettier config is referenced by both `backend/` and `frontend/` (no duplicated, divergent rule sets)
- [ ] Tooling choices are recorded in `DECISIONS.md`

## Dependencies
Ticket 1-1 (Backend Scaffolding & TypeScript Config), Ticket 1-2 (Frontend Scaffolding & TypeScript Config)
