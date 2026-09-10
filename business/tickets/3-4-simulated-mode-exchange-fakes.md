# Ticket 3-4: Simulated Mode — Local Fake Exchange Clients

## Epic
Epic 3: Market Data & Exchange Integration

## Context
[[business]] requires a startup toggle that replaces both exchange clients with local fakes, with zero network access, so the whole system (including Epic 4/5/6 later) can run end-to-end without hitting Binance or OKX. This also gives every other ticket's tests a reusable fake instead of a second mocking layer, per [[backend]]'s testing convention.

## Scope
- A `FakeBinanceClient` and `FakeOkxClient` under `backend/src/exchanges/`, each implementing the interface from [[3-1]]/[[3-2]] with in-memory, hardcoded-but-plausible prices for USDT/BRL and USDT/`<destino>` — no network access of any kind.
- A startup toggle (e.g. an env var read once at process start) that selects real (`BinanceClient`/`OkxClient`) vs. fake clients app-wide, without [[3-3]]'s `MarketDataService` or any later code needing to know which mode is active.
- Document how to activate Simulated Mode in `backend/README.md` (the env var name and value), per [[business]]'s requirement that this be documented — Epic 7 will later fold this into a final documentation pass, but the instructions must exist as soon as the toggle does.

## Out of scope
- Any change to `MarketDataService`'s composition logic (ticket 3-3) — the fakes must satisfy the same interface, not require special-casing
- Frontend or e2e wiring of simulated mode (Epic 6, Epic 7's final sanity check)
- Full README polish beyond the activation instructions (Epic 7)

## Acceptance Criteria
- [ ] `FakeBinanceClient` and `FakeOkxClient` implement the same interface as the real clients and make no network calls (verified by a test asserting no HTTP/WebSocket activity, e.g. via a network-access guard or by construction)
- [ ] With the startup toggle set to simulated mode, `MarketDataService` from [[3-3]] produces a composed price using only the fakes, with no code path attempting a real Binance/OKX call
- [ ] With the toggle set to live mode (or left at its default), the real clients from [[3-1]]/[[3-2]] are used instead
- [ ] `backend/README.md` documents the exact toggle (env var name and value) needed to run in Simulated Mode
- [ ] Tests (Vitest, colocated per [[backend]]) cover both toggle positions resolving to the correct client set
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 3-1 (Exchange Client Interface & Binance REST Client), Ticket 3-2 (OKX WebSocket Client with REST Polling Fallback)
