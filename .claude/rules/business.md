---
paths:
- "business/**"
- "backend/**"
- "frontend/**"
---

# Business Rules

Domain constraints from the challenge spec (`Desafio.html`). These are not up for
reinterpretation — if a ticket seems to conflict with one of these, stop and ask the user
rather than picking a side.

## Auth

- Username-only login. No password, registration, or account-recovery mechanism — ever.
  This is deliberate per the challenge spec, not an oversight to "fix".

## Users & spread

- Users are pre-seeded, not self-registered: `alice` (0%), `bob` (0.6%), `carol` (1%).
- Spread is per-user and applies only to that user's own quotes.

## Supported currencies

- Destination currencies are exactly: `EUR`, `ARS`, `COP`, `MXN`, `ZAR`. Anything else must
  be rejected — don't accept arbitrary currency codes.
- The corresponding trading pairs must be resolved from Binance's own API, not hardcoded
  pair strings.

## Book, bid, ask

- Use only the top of book (best bid / best ask). No depth/liquidity checks — assume the
  best price fills any client volume.
- Buying an asset pays the ask; selling an asset receives the bid.

## Price calculation

- The client buys destination currency using BRL, bridged through USDT:
  1. Buy USDT with BRL at the USDT/BRL **ask**.
  2. Sell that USDT for the destination currency at the USDT/`<destino>` **bid**.
     - Binance lists some destination currencies only the other way round: EUR trades as
       EUR/USDT, and there is no USDT/EUR. When USDT/`<destino>` is not listed, step 2 is the
       same trade on `<destino>`/USDT — buy the destination currency with USDT at that pair's
       **ask**. A listed USDT/`<destino>` always takes precedence. A listed pair that can't be
       priced — halted (not TRADING), unreachable, or with an empty side of the book — is an
       outage (no quote capability), never a reason to try the other order. Only a pair Binance
       doesn't list at all sends the lookup to the other order. This clarifies step 2; it does
       not replace it.
  3. Apply the user's spread on top of that composed BRL cost.
- Reference check: USDT/BRL ask = 5.00, USDT/MXN bid = 16.00, spread = 0.6% → 100 MXN costs
  R$31.44. Any implementation of the pricing formula must reproduce this exactly.
- Rounding: always 2 decimal places, always **round up** (ceiling) — never round-half or
  truncate.
- Monetary precision: never use floating-point `number` for money math or storage. The
  concrete representation (e.g. integer cents, a decimal library) is a call for
  `DECISIONS.md`; if it isn't decided yet when you need it, ask — don't pick silently.

## Quote lifecycle

- A quote is valid for exactly 10 seconds from creation.
- A quote can be confirmed exactly once.
- Expired confirmation attempts must be rejected and must **not** be recorded anywhere.
- Concurrent or duplicate confirmation requests for the same quote must result in exactly
  one recorded confirmation — this needs a real concurrency guarantee (DB constraint/lock),
  not just an in-process check.

## Price composition & availability

- USDT/BRL leg: when both Binance and OKX are available, use whichever gives the cheaper
  result for the client; when OKX is down, use Binance only.
- USDT/`<destino>` leg: always Binance.
- Binance down → the system generates no quotes at all (not an error page — simply no
  quote capability).
- OKX down → the system automatically falls back to Binance-only for the BRL leg.
- Exchange network failures, timeouts, or malformed responses must never crash the process
  or surface as a generic/opaque error to the client.

## OKX price source

- OKX price comes from a WebSocket connection, keeping only the last known USDT/BRL price
  in memory.
- If the socket drops or goes stale, fall back to REST polling every 1 second until the
  socket recovers, then switch back automatically.
  - "Stale" means the last known price is too old to quote from — not that the socket has
    gone quiet. The OKX tickers channel only pushes on change, so silence on a thin pair
    like USDT/BRL is normal and must not be treated as a failed connection. Whether the
    connection itself is alive is answered by OKX's own `ping`/`pong` keepalive, which is
    what may trigger a reconnect. This clarifies the spec rule above; it does not replace
    it.
- A quote request never waits on OKX — it reads whatever is currently in memory, or treats
  OKX as unavailable if nothing usable is there.

## Binance rate limits

- The system must not approach Binance's per-IP rate limits even under thousands of
  concurrent quote requests. The specific strategy for this (shared caching interval,
  request coalescing, etc.) belongs in `DECISIONS.md` — check there before choosing one,
  and don't introduce a second, different strategy elsewhere in the codebase.

## Simulated mode

- The system must support a startup toggle that replaces both exchange clients with local
  fakes, with zero network access.
- In simulated mode, the system must be fully operable end-to-end: login, quote creation,
  confirmation, expiration, and history all work normally against simulated prices.
- How to activate it must be documented in `README.md`.
