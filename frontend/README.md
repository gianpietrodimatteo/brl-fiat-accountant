# Frontend

Next.js (App Router), TypeScript and Tailwind CSS UI for the BRL/Fiat Accountant. It is only a
presentation layer over the backend HTTP API: it never computes prices, spreads or rounding, and
every backend call goes through one API client, `src/lib/api.ts`. See the
[repo root README](../README.md) for how to run the whole stack, and
[backend/README.md](../backend/README.md) for the API it calls.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- npm
- A running backend, by default at http://localhost:3001 (see
  [backend/README.md](../backend/README.md#running-the-server))

## Setup

```bash
cd frontend
npm install
```

## Running

```bash
npm run dev
```

Starts `next dev` at http://localhost:3000. The backend's default `CORS_ORIGIN` is that same
origin, so the two work together without any configuration. If you serve the frontend from
another origin, set the backend's `CORS_ORIGIN` to match.

For a production build, run `npm run build` and then `npm start`.

Next.js allows only one `next dev` per project folder, so stop yours before running the
[e2e suite](../e2e/README.md), which starts its own.

## Scripts

| Script                 | Description                                |
| ---------------------- | ------------------------------------------ |
| `npm run dev`          | Runs the development server (`next dev`)   |
| `npm run build`        | Builds for production (`next build`)       |
| `npm start`            | Serves the production build (`next start`) |
| `npm run lint`         | ESLint                                     |
| `npm run format`       | Prettier, writes fixes                     |
| `npm run format:check` | Prettier, check only                       |
| `npm test`             | Runs the Vitest suite once                 |
| `npm run test:watch`   | Runs Vitest in watch mode                  |

## Configuration

| Variable                   | Default                 | Description                   |
| -------------------------- | ----------------------- | ----------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | Backend URL the browser calls |

Next.js inlines `NEXT_PUBLIC_*` variables into the browser bundle when `next dev` starts or
`next build` runs, so a change needs a restart of the dev server or a new build:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4001 npm run dev
```

With Docker Compose the variable is a build argument, so rebuild with
`docker compose up --build` after changing it. A trailing slash is ignored, and an empty value
falls back to the default.

## Screens

| Route        | Screen                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `/`          | Redirects to `/quotation` when logged in, or to `/login` otherwise                             |
| `/login`     | Username field only: no password, registration or recovery                                     |
| `/quotation` | Currency and quantity form, the created quote with its prices and expiry, and **Confirm**      |
| `/history`   | The user's confirmed quotes, in the order the backend returns them (newest confirmation first) |

`/quotation` and `/history` are wrapped in `AuthenticatedShell`
(`src/components/authenticated-shell.tsx`), which shows the navigation and sends a visitor
without a session to `/login`, including after the backend answers `401`.

The session token is kept in `sessionStorage` (`src/lib/session.tsx`): it survives a reload and
ends when the tab closes. There is no logout button.

Amounts arrive from the backend as integers in minor units. `src/lib/amounts.ts` only formats
them for display and turns the typed quantity (up to 2 decimals, e.g. `100.50`) into minor units
by parsing the string, never with floating-point math. Whether a quote has expired is decided by
the backend alone: the screen keeps **Confirm** available until a confirm response says
otherwise.

## Tests

```bash
npm test
```

Runs Vitest once, with jsdom and React Testing Library. Tests are colocated with the code they
cover (`page.tsx` + `page.test.tsx`) and mock the API client, not `fetch`. `npm run test:watch`
re-runs on change.

Full flows across screens (login, quote, confirm, history) are covered by the Playwright suite in
[`e2e/`](../e2e/README.md), not here.
