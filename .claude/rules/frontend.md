# Frontend Conventions

Applies to everything under `frontend/`. See [[business]] for the domain rules the UI must
reflect (it must not reimplement them).

## Structure

- Next.js App Router under `frontend/src/app/`, one route per screen — already scaffolded:
  `/login`, `/quotation`, `/history` (plus the root `page.tsx`).
- Styling is Tailwind CSS v4 (`postcss.config.mjs`, `globals.css`) — use it rather than
  introducing another styling approach (CSS modules, styled-components, etc.).

## API-only, no business logic in the UI

- The frontend is a pure presentation layer over the backend HTTP API. It must not:
  - compute prices, spreads, or rounding — the backend returns the final price;
  - talk to SQLite or the exchanges directly;
  - duplicate validation the backend already owns (e.g. currency whitelist) beyond basic
    UX affordances like disabling a submit button.
- All backend calls go through a single API client layer (e.g. `src/lib/api.ts`) —
  pages/components should not call `fetch` ad hoc against backend URLs scattered around.
- Session/auth state (the logged-in username) is client-side state derived from the login
  response. No password fields, no account/registration UI — not applicable per the
  challenge spec.

## Screens

Match the ticket's spec exactly, don't add or drop fields:

- **Login** — username field only.
- **Quotation** — currency selection, quantity input, create-quote action; on success shows
  the price and a Confirm action; confirming after expiry shows an expired-quote message.
- **History** — confirmed quotes only, showing currency, quantity, unit price, total price,
  and timestamp. No filters, no pagination.

## Lint/format

- `npm run lint` (`eslint-config-next` + `eslint-config-prettier`) and
  `npm run format:check` (Prettier, root `.prettierrc.json`) must both pass before a
  frontend ticket is done.
