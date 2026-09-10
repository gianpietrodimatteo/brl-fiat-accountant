---
paths:
- "e2e/**"
---

# E2E Testing Conventions

Applies to the top-level `e2e/` package. See [[business]] for the domain rules the flows
must satisfy, [[backend]] and [[frontend]] for the apps it drives.

## Stack & structure

- **Playwright**, in a top-level `e2e/` package with its own config and `package.json` —
  it drives the frontend through the browser against the real backend (or the backend
  running in Simulated Mode), so it doesn't belong inside either app.
- E2E covers full user flows (e.g. login → create quote → confirm → history), not
  component-level behavior — that's what the backend/frontend unit/component layers are
  for; don't duplicate that coverage here.
- Specs live under `e2e/tests/` (or equivalent under the `e2e/` package), named after the
  flow they cover (e.g. `quote-lifecycle.spec.ts`).

## Coverage

No enforced numeric coverage threshold — judge adequacy by whether the acceptance criteria
and edge cases called out in the ticket are actually exercised, not by a percentage.

## Running tests

- The `e2e/` package exposes its own `npm test` running the Playwright suite.
- Per the run-task workflow (`.claude/skills/run-task/done.md`), tests for the touched
  app(s) must pass before a ticket is considered done.
