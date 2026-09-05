# Epic 6: Frontend Application

## Goal
Build the React (Next.js) client with the three required screens, consuming the backend API exclusively.

## Scope
- Next.js project structure and routing for the three screens
- Login screen: username field
- Quotation screen: currency selection, quantity input, create-quote action, price display, Confirm action, expired-quote messaging
- History screen: list of confirmed quotes (currency, quantity, unit price, total price, timestamp) — no filters, no pagination
- API client layer for talking to the backend
- Session/auth state handling on the client

## Out of scope
- Any backend logic — the frontend is purely a presentation layer over the API
- Password/registration UI — not applicable per challenge spec

## Dependencies
Epic 1 (Project Setup & Tooling), Epic 5 (HTTP API)

## Tickets
See `business/tickets/` for tickets numbered under this epic.
