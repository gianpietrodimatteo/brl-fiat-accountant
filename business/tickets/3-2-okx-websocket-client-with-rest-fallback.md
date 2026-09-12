# Ticket 3-2: OKX WebSocket Client with REST Polling Fallback

## Epic
Epic 3: Market Data & Exchange Integration

## Context
[[business]] requires the OKX USDT/BRL leg to come from a WebSocket feed that never blocks a quote request, with an automatic REST fallback when the socket is unhealthy. This ticket builds that client against the shared interface from [[3-1]], so [[3-3]] can later treat it as just another (optional) BRL-leg source.

## Scope
- An `OkxClient` implementing the exchange-client interface from [[3-1]] (`backend/src/exchanges/ExchangeClient.ts`: `getTopOfBook(baseAsset, quoteAsset)` → `{ status: 'available', bid, ask } | { status: 'unavailable', reason }`, prices as `decimal.js` values):
  - Opens a WebSocket connection to OKX and keeps only the last known USDT/BRL price in memory (no history, no depth).
  - Reads never wait on the socket — a price lookup returns whatever is currently in memory, or an "unavailable" result if nothing usable is there yet.
  - Detects a dropped or stale connection (e.g. no update within an expected interval) and switches to REST polling every 1 second for USDT/BRL until the socket is healthy again, then automatically switches back to the WebSocket.
- Network failures, timeouts, and malformed responses (both WS and REST) are caught at this boundary and turned into the same typed "unavailable" outcome used by [[3-1]] — never a raw exception, per [[backend]].

## Out of scope
- Binance client (ticket 3-1)
- Combining/composing legs from multiple exchanges (ticket 3-3)
- Simulated Mode fakes and the startup toggle (ticket 3-4)
- Any pair other than USDT/BRL — OKX is only ever used for the BRL leg per [[business]]

## Acceptance Criteria
- [ ] `OkxClient` implements the interface from [[3-1]] and exposes the last known USDT/BRL price
- [ ] A price lookup never blocks waiting on the WebSocket; it returns immediately from in-memory state or as "unavailable"
- [ ] Simulating a dropped/stale WebSocket connection causes the client to start REST-polling USDT/BRL at a 1-second interval
- [ ] Simulating socket recovery causes the client to stop REST polling and resume using WebSocket updates, automatically, with no manual intervention
- [ ] A simulated network failure, timeout, or malformed response (WS or REST) results in a typed "unavailable" outcome, never a thrown exception reaching the caller
- [ ] Tests (Vitest, colocated per [[backend]]) cover: in-memory price serving, staleness detection triggering fallback, recovery back to WebSocket, and unavailable-on-failure behavior — using a fake WS/HTTP transport injected into the client, local to this ticket's tests (not real OKX, and not the [[3-4]] fakes — they bypass the very boundary under test, per [[backend]]'s testing rule)
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 3-1 (Exchange Client Interface & Binance REST Client)
