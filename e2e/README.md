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

## Live-mode manual checklist

The suite never runs in live mode: it would depend on Binance and OKX being reachable and turn
flaky. Before a delivery, walk through this checklist by hand instead.

Run it against the Docker stack in live mode. From the repository root:

```bash
docker compose up
```

Leave `EXCHANGE_MODE` unset (or set it to `live`), and make sure no `.env` file sets it to
`simulated`. Open http://localhost:3000.

Prices are live, so the amounts change from run to run. The steps check behavior, not specific
values. If Binance or OKX can't be reached from where you run it, record the checklist as
**not run**, with the reason. Never record it as a pass.

1. **Mode.** Run `docker compose logs backend | grep "exchange mode"`.
   **Expected:** it prints `exchange mode: live`.
2. **Log in as `alice`.** On http://localhost:3000/login, type `alice` and click **Log in**.
   **Expected:** the **New quote** screen (`/quotation`) opens, and the header shows
   `Logged in as alice`.
3. **Log in as `bob` and `carol`.** The session belongs to the browser tab, so open a new tab for
   each user, go to http://localhost:3000/login and log in. Keep alice's and carol's tabs open for
   step 6. **Expected:** each tab opens **New quote**, and its header shows that tab's username.
4. **Unknown username.** In another new tab, log in as `mallory`. **Expected:** the page stays on
   `/login` and shows `Unknown username.`
5. **A quote for every currency.** As `alice`, create a quote for `100.00` of each of `EUR`,
   `ARS`, `COP`, `MXN` and `ZAR`: choose the currency, type the quantity and click
   **Create quote**. **Expected:** every currency shows a quote panel with that currency, quantity
   `100.00`, a unit price and total price above `R$ 0.00`, and an **Expires at** time. None shows
   `Quotes are temporarily unavailable. Please try again in a moment.`
   - **EUR is the reversed-pair case.** Binance lists EUR only as `EUR/USDT` (there is no
     `USDT/EUR`), so the EUR quote is the one that exercises the reversed-pair path. If EUR is
     unavailable while the other four work, that path is broken.
6. **Spread.** In alice's tab, create a quote for `100.00 MXN` and note the total. Straight away
   (within a few seconds, before the market moves), do the same in carol's tab.
   **Expected:** carol's total is higher than alice's, by about 1% (alice's spread is 0%, carol's
   is 1%).
7. **Confirm in time.** Create a quote, note its currency, quantity and total, and click
   **Confirm** within 10 seconds. **Expected:** `Quote confirmed at <time>.` shows. Click
   **History**: the top row of **Confirmed quotes** has the same currency, quantity and total
   price.
8. **Confirm after expiry.** Click **Quotation**, create a quote and note its total. Wait until
   more than 10 seconds have passed (past its **Expires at** time), then click **Confirm**.
   **Expected:** `This quote has expired. Create a new quote to get a current price.` shows.
   Click **History**: the expired quote is not listed, and the top row is still the quote
   confirmed in step 7.
9. **Backend logs.** Run `docker compose logs backend`, then `docker compose ps`.
   **Expected:** no `unhandled error`, no `backend failed to start`, no stack trace and no
   `no quote capability` warning. The backend service is `Up`, not `Restarting`.
10. **OKX on WebSocket.** The backend doesn't log the OKX feed's state, so check its connection
    instead. Run this twice, about 15 seconds apart:

    ```bash
    docker compose exec backend netstat -tn | grep ':8443'
    ```

    **Expected:** both times, one `ESTABLISHED` connection to port `8443` (OKX's WebSocket), with
    the same local port both times. No output means the feed isn't connected, and quotes are
    being priced from the REST fallback. A different local port each time means the feed keeps
    reconnecting.

Stop the stack with `Ctrl+C` when you're done.

## Scripts

| Script                 | Description                      |
| ---------------------- | -------------------------------- |
| `npm test`             | Runs the Playwright suite once   |
| `npm run typecheck`    | Type-checks the config and specs |
| `npm run lint`         | ESLint                           |
| `npm run format`       | Prettier, writes fixes           |
| `npm run format:check` | Prettier, check only             |
