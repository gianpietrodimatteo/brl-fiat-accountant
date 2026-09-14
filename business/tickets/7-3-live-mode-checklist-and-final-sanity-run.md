# Ticket 7-3: Live-Mode Checklist & Final Sanity Run

## Epic
Epic 7: Documentation & Delivery

## Context
The epic requires a final end-to-end sanity check in both live and simulated modes. Simulated mode is automated by [[7-1]]. Live mode depends on Binance and OKX being reachable, which would make an automated suite flaky, so it becomes a documented manual checklist. This ticket writes that checklist and runs the whole thing (both modes, from the README) one last time before delivery.

## Scope
- Add a **Live-mode manual checklist** section to `e2e/README.md`. It is a numbered list of steps with the expected result of each, run against `docker compose up` in `live` mode:
  - Log in as `alice`, `bob` and `carol`. An unknown username is rejected.
  - Create a quote for each of `EUR`, `ARS`, `COP`, `MXN` and `ZAR`, and each returns a price. EUR is the pair Binance lists only as EUR/USDT, so it exercises the reversed-pair path.
  - Same currency and quantity back-to-back for `alice` (0%) and `carol` (1%): carol's total is higher.
  - Confirm a quote within 10 seconds → it appears at the top of `/history` with the same total.
  - Let a quote pass 10 seconds, then confirm → the expired message shows, and the quote is not in history.
  - Backend logs during the run show no crash or unhandled error, and the OKX feed connected (WebSocket, not stuck on REST fallback).
- Run the final sanity pass from a fresh clone of `main`, following the root README ([[7-2]]):
  1. `EXCHANGE_MODE=simulated docker compose up --build` and a manual walk through login → quote → confirm → expiry → history
  2. `npm test` in `e2e/` ([[7-1]])
  3. The live-mode checklist above against `docker compose up` in `live` mode
  4. `npm run lint`, `npm run format:check`, `npm run build` and `npm test` in `backend/` and `frontend/`
- Report the outcome to the user: pass/fail per step, and for any failure the exact step, what was observed, and the relevant log excerpt.

## Out of scope
- Fixing defects found during the run. They are reported to the user, who decides whether they become a follow-up ticket (this epic takes no new feature work).
- Automating live mode, or simulating exchange outages in live mode (OKX-down/Binance-down behavior is covered by backend tests)
- Load or rate-limit testing against the real Binance API
- README content outside `e2e/README.md` (ticket 7-2) and the `DECISIONS.md` / commit-history audit (ticket 7-4)

## Acceptance Criteria
- [ ] `e2e/README.md` has a numbered live-mode checklist covering every bullet in Scope, each step with an explicit expected result
- [ ] The checklist names all five currencies and explicitly flags EUR as the reversed-pair (EUR/USDT) case
- [ ] The sanity run was done on a fresh clone of `main` (not the working copy), with commands copied from the READMEs rather than typed from memory
- [ ] All four run steps were executed, and the user got a pass/fail result for each, with observations and log excerpts for any failure
- [ ] If live mode can't be run (e.g. exchanges unreachable from the environment), that is reported as "not run" with the reason, never as a pass
- [ ] `git diff` for this ticket touches only `e2e/README.md`

## Dependencies
Ticket 7-1 (Playwright E2E Suite in Simulated Mode), Ticket 7-2 (README Delivery Pass)
