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
- [x] `DECISIONS.md` records the chosen Binance rate-limit strategy and the alternatives considered
- [x] `BinanceClient` resolves USDT/BRL and USDT/`<destination>` pairs via a Binance API call, not a hardcoded pair map
- [x] `BinanceClient` returns top-of-book bid/ask for a resolved pair
- [x] A simulated network failure, timeout, or malformed response from Binance results in a typed "unavailable" outcome, not a thrown exception reaching the caller
- [x] A test simulating hundreds of concurrent calls to the client demonstrates the underlying request rate to Binance stays bounded (e.g. capped at one in-flight/cached request per interval), not one request per caller
- [x] Tests (Vitest, colocated per [[backend]]) cover: pair resolution, successful bid/ask fetch, unavailable-on-failure behavior, and the rate-limit strategy's bounded-request-rate behavior
- [x] `npm run lint` and `npm run format:check` pass in `backend/`
- [x] `npm test` passes in `backend/`

## Delivered
- `backend/src/exchanges/ExchangeClient.ts` — the shared interface: `getTopOfBook(baseAsset, quoteAsset)` returning a typed `{ status: 'available', bid, ask } | { status: 'unavailable', reason }`, with prices as `decimal.js` values (never floats). [[3-2]] and [[3-4]] implement this same interface.
- `backend/src/exchanges/CoalescingCache.ts` — the one canonical rate-limit strategy: concurrent callers for a key share one in-flight request, and the resolved outcome is cached for a TTL that may vary per value. Don't add a second strategy elsewhere.
- `backend/src/exchanges/BinanceClient.ts` — symbol resolution from `exchangeInfo` (cached 10 min on success, 1s on failure so a transient outage doesn't block quoting), bid/ask from `ticker/bookTicker` (cached 1s).
- Added `decimal.js` to `backend/`.

Two deviations, both agreed with the user during implementation:
- A failed pair resolution is cached for 1s rather than the 10 min the `DECISIONS.md` text implies for exchange-info, so one transient failure can't suppress quotes for 10 minutes after Binance recovers. Recorded as an addendum in `DECISIONS.md`.
- [[backend]]'s testing rule was amended (additively) rather than followed as written — see the note added to [[3-4]].

## Dependencies
Epic 1 (Project Setup & Tooling), Epic 2 (Backend Core & Persistence)
