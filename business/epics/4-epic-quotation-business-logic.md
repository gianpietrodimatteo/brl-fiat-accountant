# Epic 4: Quotation Business Logic

## Goal
Implement the domain rules that turn composed market prices into a quote the client can trust: spread application, rounding, precision, expiration, and exactly-once confirmation.

## Scope
- Price calculation: apply user-specific spread to the composed BRL/USDT + USDT/destination cost
- Rounding rule: 2 decimal places, round up
- Monetary precision: choice of numeric type/representation for money throughout calculation, rounding, and storage (documented in `DECISIONS.md`)
- Quote lifecycle: 10-second validity window from creation
- Confirmation: exactly-once semantics under concurrent/duplicate confirmation requests for the same quote
- Expired confirmation attempts are rejected and not recorded
- Recording confirmed quotes into the user's history

## Out of scope
- Fetching/composing raw market prices (Epic 3)
- HTTP transport concerns — request parsing, response shaping (Epic 5)

## Dependencies
Epic 2 (Backend Core & Persistence), Epic 3 (Market Data & Exchange Integration)

## Tickets
See `business/tickets/` for tickets numbered under this epic.
