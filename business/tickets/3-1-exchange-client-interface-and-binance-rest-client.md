# Ticket 3-1: Exchange Client Interface & Binance REST Client

## Epic
Epic 3: Market Data & Exchange Integration

## Context
Every later ticket in this epic (OKX feed, price composition, simulated fakes) needs a common shape to implement or consume. This ticket settles that shape, builds the Binance client against it, and settles the open rate-limit-strategy question from [[business]] before any concurrent-load code depends on it.

## Scope
- A shared exchange-client interface under `backend/src/exchanges/` (per [[backend]]'s folder conventions) that both the real Binance/OKX clients and the Simulated Mode fakes ([[3-4]]) will implement — e.g. something like "get top-of-book bid/ask for a given pair," typed so a caller never sees exchange-specific response shapes.
- A `BinanceClient` implementing that interface:
  - Resolves the USDT/BRL and USDT/`<destination>` trading pairs from Binance's own instruments/exchange-info API — no hardcoded pair strings, per [[business]].
  - Fetches top-of-book bid/ask only (no depth/liquidity) for a given pair.
  - Network failures, timeouts, and malformed responses are caught at this boundary and turned into a typed "unavailable" result — never a raw exception, per [[backend]]'s error-handling convention.
- Decide and record in `DECISIONS.md` the rate-limit-safe request strategy for Binance under concurrent load (e.g. a shared polling interval with an in-memory cache serving all concurrent requests, vs. request coalescing) — this is the one canonical strategy; don't leave room for a second one to appear later in the codebase.
- Implement that chosen strategy so that many concurrent callers to the Binance client result in a bounded, low request rate to Binance's API regardless of caller volume.

## Out of scope
- OKX client (ticket 3-2)
- Combining/composing legs from multiple exchanges (ticket 3-3)
- Simulated Mode fakes and the startup toggle (ticket 3-4)
- Spread, rounding, quote lifecycle (Epic 4)
- HTTP endpoints (Epic 5)

## Acceptance Criteria
- [ ] `DECISIONS.md` records the chosen Binance rate-limit strategy and the alternatives considered
- [ ] `BinanceClient` resolves USDT/BRL and USDT/`<destination>` pairs via a Binance API call, not a hardcoded pair map
- [ ] `BinanceClient` returns top-of-book bid/ask for a resolved pair
- [ ] A simulated network failure, timeout, or malformed response from Binance results in a typed "unavailable" outcome, not a thrown exception reaching the caller
- [ ] A test simulating hundreds of concurrent calls to the client demonstrates the underlying request rate to Binance stays bounded (e.g. capped at one in-flight/cached request per interval), not one request per caller
- [ ] Tests (Vitest, colocated per [[backend]]) cover: pair resolution, successful bid/ask fetch, unavailable-on-failure behavior, and the rate-limit strategy's bounded-request-rate behavior
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Epic 1 (Project Setup & Tooling), Epic 2 (Backend Core & Persistence)
