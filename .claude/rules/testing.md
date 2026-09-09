# Testing Standards

Cross-cutting testing conventions for the whole repo. See [[backend]] and [[frontend]] for
the runner/library choice specific to each app.

## Every feature needs tests

Whenever a ticket adds or changes behavior (a business rule, an endpoint, a UI screen's
logic), the same change must include tests for it. A ticket that adds logic with no tests
is not done — this applies going forward from this rule's introduction, not retroactively
to already-merged scaffolding-only tickets.

## Stack

- Backend unit/integration tests: **Vitest** (see [[backend]]).
- Frontend unit/component tests: **Vitest + React Testing Library** (see [[frontend]]).
- End-to-end tests: **Playwright**, in a top-level `e2e/` package with its own config and
  `package.json` — it drives the frontend through the browser against the real backend
  (or the backend running in Simulated Mode), so it doesn't belong inside either app.
  E2E covers full user flows (e.g. login → create quote → confirm → history), not
  component-level behavior — that's what the unit/component layers are for.

## File placement

- Unit/integration test files are colocated with the source they test:
  `src/domain/pricing.ts` + `src/domain/pricing.test.ts`, not a mirrored `__tests__` tree.
- E2E specs live under `e2e/tests/` (or equivalent under the `e2e/` package), named after
  the flow they cover (e.g. `quote-lifecycle.spec.ts`).

## Coverage

- No enforced numeric coverage threshold — there's no CI to gate on it, and a threshold
  invites tests written to hit a number rather than to verify behavior. Judge test
  adequacy by whether the acceptance criteria and edge cases called out in the ticket are
  actually exercised, not by a percentage.

## Running tests

- Each app exposes `npm test` (single run) from its own directory (`backend/`,
  `frontend/`); add a `test:watch` script if useful during development.
- The `e2e/` package exposes its own `npm test` running the Playwright suite.
- Per the run-task workflow (`.claude/skills/run-task/done.md`), tests for the touched
  app(s) must pass before a ticket is considered done.
