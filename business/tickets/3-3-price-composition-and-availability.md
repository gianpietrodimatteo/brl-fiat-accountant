# Ticket 3-3: Price Composition & Availability Handling

## Epic
Epic 3: Market Data & Exchange Integration

## Context
[[3-1]] and [[3-2]] each expose one exchange's prices; Epic 4's pricing logic needs a single composed view of the two legs it actually cares about (USDT/BRL and USDT/`<destino>`), with [[business]]'s availability rules already applied, so it never has to know Binance and OKX exist.

## Scope
- A `MarketDataService` (or equivalent) under `backend/src/domain/` or `backend/src/services/`, per [[backend]]'s folder conventions, that:
  - For the USDT/BRL leg: queries both `BinanceClient` and `OkxClient`; when both are available, uses whichever gives the cheaper result for the client; when OKX is unavailable, uses Binance only.
  - For the USDT/`<destino>` leg: always uses `BinanceClient`.
  - Returns a typed "no quote capability" result when Binance is unavailable (Binance down means no quotes at all, regardless of OKX), per [[business]] — never an error, never a partial/garbage price.
  - Returns a typed composed-price result (both legs, ready for Epic 4's spread/rounding logic) when Binance is available.
- No new network calls or protocols here — this ticket only orchestrates the two clients from [[3-1]] and [[3-2]].

## Out of scope
- Spread application, rounding, quote lifecycle (Epic 4)
- Simulated Mode fakes and the startup toggle (ticket 3-4) — though this service must work unchanged when fakes are swapped in
- HTTP endpoints (Epic 5)

## Acceptance Criteria
- [ ] `MarketDataService` returns the cheaper of Binance/OKX for the BRL leg when both are available (covered by a test where the fake OKX price is cheaper, and one where the fake Binance price is cheaper)
- [ ] `MarketDataService` returns Binance's BRL price when OKX is unavailable
- [ ] `MarketDataService` returns a typed "no quote capability" result (not an exception, not a 500-shaped error) when Binance is unavailable, regardless of OKX's state
- [ ] `MarketDataService` always sources the USDT/`<destino>` leg from Binance
- [ ] No combination of Binance/OKX failure (timeout, malformed response, connection drop) surfaces as an unhandled exception from this service
- [ ] Tests (Vitest, colocated per [[backend]]) cover all the above cases using fakes/stubs of the [[3-1]]/[[3-2]] clients
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 3-1 (Exchange Client Interface & Binance REST Client), Ticket 3-2 (OKX WebSocket Client with REST Polling Fallback)
