# Ticket 6-2: Client Session State, Login Screen & Route Guarding

## Epic
Epic 6: Frontend Application

## Context
The backend issues a bearer token on username-only login ([[5-2]]). The frontend has to keep that token, send it through [[6-1]]'s API client, and keep the two authenticated screens away from anyone who hasn't logged in. Per [[business]], login is a username and nothing else: no password, registration or recovery.

## Scope
- A session provider (e.g. a React context in `frontend/src/lib/session.tsx`, mounted in the root layout) holding `{ token, username }`:
  - persisted in **`sessionStorage`**: it survives a reload, is cleared when the tab closes and isn't shared across tabs
  - read on mount without a hydration mismatch. Components that depend on it are client components, and nothing reads `sessionStorage` during server rendering.
  - exposes `signIn(token, username)`, `clearSession()` and the current session (or none)
  - a malformed stored value is treated as no session, never a crash
- Login screen at `/login`:
  - one username field and one submit action, nothing else
  - submit is disabled while the field is empty or a request is in flight
  - on success: `signIn`, then navigate to `/quotation`
  - `401 invalid_username` → an "unknown username" message, staying on `/login`
  - `network_error` or any other failure → a generic "couldn't reach the server" style message, never a crash
- Route guarding:
  - `/quotation` and `/history` send a visitor with no session to `/login`
  - `/login` with an existing session goes to `/quotation`
  - `/` goes to `/quotation` or `/login`, depending on the session
- A `401 unauthorized` from any authenticated API call (e.g. a stale token after the database volume was reset) clears the session and sends the user to `/login`. It is implemented once (in the session layer or a small wrapper around the API client), not per screen.
- A minimal shared header on the authenticated screens, showing the logged-in username and links to Quotation and History
- Draft a `DECISIONS.md` entry for the user to paste in: the token kept in `sessionStorage`, with the rejected alternatives `localStorage` (sticks across tabs and restarts, with no backend logout or expiry) and memory only (a reload logs the user out)

## Out of scope
- Any password, registration, recovery, logout endpoint or session-expiry mechanism, forbidden by [[business]] and [[5-2]]
- Quotation and History screen content (tickets 6-3, 6-4)
- A client-side username whitelist: the backend decides which usernames exist
- Server-side (Next.js middleware/cookie) auth: the token lives only in the browser

## Acceptance Criteria
- [ ] `/login` renders exactly one text input (username) and one submit button, and no password-type input exists anywhere in `frontend/src`
- [ ] Submitting `alice` (API client mocked with success) stores the token and username in `sessionStorage` and navigates to `/quotation`
- [ ] Submitting `mallory` (API client mocked with `401 invalid_username`) shows an unknown-username message, stores nothing, and stays on `/login`
- [ ] A mocked `network_error` shows a connection message and the form can be submitted again
- [ ] The submit button is disabled for an empty or whitespace-only username and while the login request is pending, so a double click sends one request
- [ ] Visiting `/quotation` or `/history` with no session redirects to `/login`; visiting `/login` with a session redirects to `/quotation`
- [ ] After a reload, the session is restored from `sessionStorage` and the user stays on the authenticated screen; a corrupted `sessionStorage` value is treated as logged out without an error
- [ ] An authenticated call answered with `401 unauthorized` clears `sessionStorage` and redirects to `/login` (tested once at the layer where it is implemented)
- [ ] The authenticated header shows the current username and links to `/quotation` and `/history`
- [ ] No hydration warnings in the browser console when loading `/login`, `/quotation` or `/history` with and without a session (checked manually with `npm run dev`)
- [ ] Draft `DECISIONS.md` text for `sessionStorage` is handed to the user; `DECISIONS.md` itself is not edited
- [ ] Component tests (Vitest + RTL, colocated) mock [[6-1]]'s API client module, not `fetch`, per [[frontend]]
- [ ] `npm run lint`, `npm run format:check`, `npm run build` and `npm test` pass in `frontend/`

## Dependencies
Ticket 6-1 (Frontend Test Tooling, API Client Layer & Amount Formatting), Ticket 5-2 (Login Endpoint & Bearer-Token Authentication)
