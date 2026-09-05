# Epic 2: Backend Core & Persistence

## Goal
Stand up the backend application skeleton and the persistence layer that the rest of the domain logic depends on.

## Scope
- SQLite schema and migrations (users, quotes, supported currencies)
- Seed script for pre-registered users (`alice`, `bob`, `carol`) with their spreads
- Username-only login/session mechanism (no password, per challenge spec)
- Domain models: User, Quote, SupportedCurrency
- Data access layer conventions (repository pattern or equivalent)

## Out of scope
- Exchange/market data integration (Epic 3)
- Pricing/spread calculation logic (Epic 4)
- HTTP endpoint definitions (Epic 5)
- Any password, registration, or account-recovery mechanism — explicitly excluded by the challenge

## Dependencies
Epic 1 (Project Setup & Tooling)

## Tickets
See `business/tickets/` for tickets numbered under this epic.
