# Ticket 1-5: Claude Code Settings & Rule Sets

## Epic
Epic 1: Project Setup & Tooling

## Context
`.claude/skills/generate-tickets` and `.claude/skills/run-task` already exist and are in active use, but `.claude/settings.json` and `.claude/rules/` (referenced by this epic's scope and by `CLAUDE.md`) don't exist yet. This ticket adds the remaining AI-assisted-work configuration so future ticket implementation sessions have consistent guardrails and context.

## Scope
- `.claude/settings.json` with baseline project settings (e.g. permissions relevant to this repo's workflow)
- `.claude/rules/business.md` — rules capturing business/domain constraints from the challenge spec (e.g. no passwords, spread-per-user, quote expiration)
- `.claude/rules/backend.md` — backend-specific conventions (folder structure, TS strictness, error handling expectations)
- `.claude/rules/frontend.md` — frontend-specific conventions (Next.js structure, API-only data access, no business logic in UI)
- Cross-reference these rule files from `CLAUDE.md` if not already implied

## Out of scope
- Any actual backend/frontend implementation the rules describe
- CI/CD configuration

## Acceptance Criteria
- [ ] `.claude/settings.json` exists and is valid JSON
- [ ] `.claude/rules/business.md`, `.claude/rules/backend.md`, and `.claude/rules/frontend.md` each exist with concrete, non-generic guidance specific to this project
- [ ] Rule content does not duplicate or contradict `CLAUDE.md` or `DECISIONS.md`
- [ ] A future ticket implementation session (via `.claude/skills/run-task`) can be pointed to these rules for backend/frontend/business context

## Dependencies
None
