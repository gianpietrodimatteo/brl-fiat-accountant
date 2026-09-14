# E2E

Playwright end-to-end suite for the BRL/Fiat Accountant. It drives the real frontend in a browser
against the real backend: login → quote → confirm → history, quote expiry, an unknown username,
and the route guard. There is no mocked API and no network interception.

## Simulated Mode only

The suite always runs the backend with `EXCHANGE_MODE=simulated`, so it never calls Binance or
OKX and passes with no network connection. Live mode is checked by hand instead (ticket 7-3).

## Prerequisites

- Node.js 24
- npm
- Free ports `3100` (frontend) and `3101` (backend). The suite won't reuse a server already
  running there; it fails instead.
- No `next dev` running in `frontend/`. Next.js allows one dev server per project folder, so
  stop yours before running the suite.

## Setup

```bash
cd e2e
npm install
npx playwright install
```

`npm install` also runs `npm ci` in `backend/` and `frontend/`, so the apps' dependencies are
installed too. `npx playwright install` downloads the browsers (`npx playwright install chromium`
is enough: the suite only runs Chromium).

## Running

```bash
npm test
```

This runs the suite once. Playwright starts both apps itself and stops them afterwards; don't
start any server by hand:

- **backend** on http://localhost:3101, with `EXCHANGE_MODE=simulated` and a new SQLite file in
  a fresh directory under the OS temp folder, so every run starts with an empty history
- **frontend** (`next dev`) on http://localhost:3100, pointed at that backend

Specs that create quotes each log in as their own seeded user (`alice` for confirmation, `bob`
for expiry), so they don't share history. The expiry spec waits past the quote's 10-second
validity, so a full run takes a little longer than that.

After a failed run, `npx playwright show-report` opens the HTML report, with a trace for each
failing test.

## Scripts

| Script                 | Description                      |
| ---------------------- | -------------------------------- |
| `npm test`             | Runs the Playwright suite once   |
| `npm run typecheck`    | Type-checks the config and specs |
| `npm run lint`         | ESLint                           |
| `npm run format`       | Prettier, writes fixes           |
| `npm run format:check` | Prettier, check only             |
