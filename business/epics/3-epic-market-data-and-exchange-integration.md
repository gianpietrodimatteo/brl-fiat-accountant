# Epic 3: Market Data & Exchange Integration

## Goal
Provide reliable, rate-limit-safe access to live (and simulated) prices from Binance and OKX, composed into the BRL/USDT and USDT/destination legs the quotation engine needs.

## Scope
- Binance REST client for USDT/BRL and USDT/<destination> pairs (top-of-book bid/ask only)
- OKX WebSocket client maintaining last known USDT/BRL price in memory
- OKX REST polling fallback (every 1s) when the WebSocket is down or the last known price is too old to quote, with automatic recovery back to WebSocket. Connection liveness (OKX's `ping`/`pong` keepalive, backoff, reconnect) is tracked separately from price freshness, since the tickers channel only pushes on change and silence on a thin pair is normal
- Price composition logic: cheapest BRL leg between Binance/OKX when both available, Binance-only when OKX is down
- Availability handling: Binance down → no quotes generated; OKX down → Binance-only; no crashes or generic errors from network failures/timeouts/invalid responses
- Rate-limit-safe request strategy for Binance under concurrent load (thousands of simultaneous users must not approach Binance's per-IP limits) — alternatives considered and the chosen approach documented in `DECISIONS.md`
- Simulated Mode: local fake implementations of both exchange clients (no network access), swappable via a startup toggle

## Out of scope
- Spread application, rounding, and quote lifecycle (Epic 4)
- HTTP endpoint definitions (Epic 5)

## Dependencies
Epic 1 (Project Setup & Tooling), Epic 2 (Backend Core & Persistence) for shared conventions/config

## Tickets
See `business/tickets/` for tickets numbered under this epic.
