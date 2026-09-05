# Epic 5: HTTP API

## Goal
Expose the backend's capabilities over HTTP, wiring persistence, market data, and business logic into the five required operations.

## Scope
- `POST` login by username (no password)
- `GET` list of supported destination currencies
- `POST` create quote (destination currency + amount → calculated price)
- `POST` confirm quote
- `GET` history of confirmed quotes for the authenticated user
- Request validation and consistent error response shape
- AuthN/session wiring for the authenticated endpoints

## Out of scope
- Business rule implementation itself (Epic 4)
- Frontend consumption (Epic 6)

## Dependencies
Epic 2 (Backend Core & Persistence), Epic 3 (Market Data & Exchange Integration), Epic 4 (Quotation Business Logic)

## Tickets
See `business/tickets/` for tickets numbered under this epic.
