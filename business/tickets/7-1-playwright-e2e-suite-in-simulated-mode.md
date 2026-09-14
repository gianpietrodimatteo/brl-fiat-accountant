# Ticket 7-1: Playwright E2E Suite in Simulated Mode

## Epic
Epic 7: Documentation & Delivery

## Context
The epic closes with an end-to-end check of the whole flow (login → quote → confirm → history). `DECISIONS.md`, [[e2e]] and tickets 3-4 and 6-1 all postpone the top-level Playwright `e2e/` package to this epic. Simulated Mode ([[3-4]]) makes that flow deterministic and needs no network, so the automated suite runs against it. Live mode gets a manual check in ticket 7-3.

## Scope
- Create the top-level `e2e/` package, following [[e2e]]: its own `package.json` (Playwright + TypeScript), `playwright.config.ts`, an `npm test` script that runs the suite once, and specs under `e2e/tests/` named after the flow they cover.
- The Playwright config starts the stack itself (`webServer` or an equivalent documented in the config). The backend runs with `EXCHANGE_MODE=simulated` against a throwaway SQLite file created fresh for each run, so no spec inherits history from an earlier one. The frontend points at that backend. No real exchange is ever called.
- Specs drive the real frontend in a browser against the real backend. No mocked API and no intercepted network:
  - **Happy path:** log in as a seeded user → pick a currency → enter a quantity → create a quote → confirm → go to `/history` and see the quote at the top, with the same currency, quantity and total the quotation screen showed.
  - **Expiry:** create a quote and wait past its 10-second validity. Confirming shows the expired message, and `/history` does not show that quote.
  - **Unknown username:** logging in with a username that isn't seeded shows the login error and stays on the login screen.
  - **Route guard:** opening `/quotation` or `/history` without a session lands on the login screen.
- Specs that share a seeded user's history must not race each other. Either run with one worker, or give each spec its own user.
- Add Playwright's output folders (`test-results/`, `playwright-report/`, etc.) to `.gitignore`.
- A short `e2e/README.md`: prerequisites, installing the browser, `npm test`, and the fact that the suite runs in Simulated Mode.

## Out of scope
- Automated live-mode specs. Live mode is the manual checklist in ticket 7-3.
- Re-testing unit- or component-level behavior already covered in `backend/` and `frontend/` (pricing math, rounding, per-field validation, concurrent-confirmation guarantees), per [[e2e]].
- Feature changes to `backend/` or `frontend/`. If a spec finds a defect, report it to the user instead of widening this ticket. A test-only affordance (e.g. a `data-testid`) is fine if the ticket says why it was needed.
- The root README pass (ticket 7-2) and the `DECISIONS.md` entry justifying Playwright (checked in ticket 7-4)

## Acceptance Criteria
- [ ] From a clean clone, `cd e2e && npm install && npx playwright install && npm test` starts the backend (simulated) and the frontend by itself and passes, with no manually started server
- [ ] The backend under test gets `EXCHANGE_MODE=simulated`. With the machine's network disconnected, `npm test` still passes
- [ ] Each run starts from a fresh SQLite file: running `npm test` twice in a row passes both times, and the happy-path history assertion never sees a quote from an earlier run
- [ ] The happy-path spec asserts that the top history row's currency, quantity and total equal the ones shown on the quotation screen for the quote it just confirmed
- [ ] The expiry spec waits past 10 seconds before confirming, asserts the expired message, and asserts that quote is absent from `/history`
- [ ] The unknown-username spec and the route-guard spec both pass
- [ ] The suite contains no `page.route`/network interception and no mocked API module
- [ ] Playwright output folders are git-ignored: after a run, `git status` shows no new untracked report or result files
- [ ] `npm test` in `backend/` and `frontend/` still passes (nothing in either app broke)

## Dependencies
Ticket 1-4 (Docker Compose Setup), Ticket 3-4 (Simulated Mode Exchange Fakes), Tickets 5-1 through 5-4 (HTTP API), Ticket 6-2 (Session State & Login Screen), Ticket 6-3 (Quotation Screen), Ticket 6-4 (History Screen)
