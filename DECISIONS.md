# Decisions

## Project Scaffolding and first epic (plus all epics definitions, bots, formats, etc.)

Node or Go would do just fine for the backend. Since you've given me the option, and I'm more comfortable with Node,
I'll proceed with Node for the backend.

Adding Next.js to React solves a lot of problems. I understand the requirements are simple, but I'll be proceeding with
these because of the industry standards and ease of scaling later on. Everything will be written in TypeScript.

All operations, including updating with external servers, will be done by the backend. The frontend will be merely an
interface to the backend application.

I'll use SQLite with docker, again, for ease of use and scaling.

I'll need different agents for this purpose. It is also important to define coding standards.
Since I'm free to pick I'll go with proven default standards for the technologies used.

First I'll break the whole task into smaller sections.
Then I'll create tickets for each section and detail what's to be done to the piece of software.
Each ticket will have context and acceptance criteria.
There will be a code review step for each proposed commit.

CLAUDE.md
.claude/settings.json
.claude/rules
.claude/skills
business/epics
business/tickets
backend/
frontend/

Generated 7 different epics with the steps to accomplish the challenge. Now we have a roadmap. First step is the initial
setup.

Started with the Claude skills because I'll need them as soon as possible. Now I build the project's foundations.
Using the created bots I'll refine first epic (the configuration epic) and tackle the activities one by one.

I'll use npm as the package manager for backend and frontend — it ships with Node, needs no extra global install, and
keeps the workflow simple for a project without CI.
Node version is the latest LTS (24)
Next.js version is the latest LTS (16)

Added ESLint and Prettier (plus eslint-config-prettier deal with conflicts). Now I can lint and format with prettier on
both projects. Both resolve to the single root for the style. Classic default settings.

Set up docker containerization for backend and frontend, set up root docker compose. Now we can easily fire up the
containers. Put a little listen in the backend just to have something running (for now).

Now that we have something tangible we can scaffold the Claude code settings file. That is a first version, it may be
edited and improved as we work throughout this project.

Oh, we were lacking tests! For the final step in the scaffolding epic we'll be adding them (there is no epic or task for
this though).

I choose Vitest for both backend and frontend unit/integration tests so we have only one runner for both tasks. React
testing library for component tests on the frontend, and I'll add Playwright for end-to-end tests on a separate top
level package (e2e).

I was tempted to use Jest because it is more established, but Vitest works well with strict CommonJS TS config, and we
benefit from the convenience of standardizing the runner for both apps.

I won't mock the exchange between clients - the requirements already ask for a local fake implementation for Binance/OKX
(Simulated Mode), so I'll reuse that for testing. Again my decision here is to have as little code as possible so the
maintenance is as cheap as possible.

Finally, there will be no coverage threshold; I understand if you disagree but from my experience this just leads to
creating useless tests just to meet the testing coverage quota.

All the rules were edited as well.

This should be it. From this point on we've defined our goals, rules, agents and scaffolded an initial project on which
we're going to add our incremental changes.

If we just complete the proposed backlog we should be able to finish this whole project with no loose ends. We'll be
following the best practices, using the best tools available, in the least amount of effort and with the least amount of
surprises.

## Epic 2 - Backend Core and Persistence

We have 2 main options when it comes to setting up the database and doing monetary operations with
JavaScript/TypeScript. One is saving everything as string and processing with decimal.js (well established library for
numeric operations). The other is saving as integers, that, on SQLite are saved as 64-bit unsigned integers, and, again,
use decimal.js on the application layer. If this project were about doing crypto operations it would make sense to store
the values as string, for we may have overflow problems in saving the numbers. However, for this specific project, we're
cool with saving the numbers on the database, and benefiting from doing mathematical operations directly on the database
whenever needed.

I know some currencies use different decimal places. However, EUR, ARS, COP, MXN, ZAR are all ISO 4217 currencies with 2
decimal places (COP is sometimes quoted without decimals in everyday use, but officially it's 2)

We will certainly NOT use floats, but instead integers counting from the cents up and storing spread as basis points:

- `quotes.quantity`, `quotes.unit_price`, `quotes.total_price` are stored as `INTEGER`
  centavos (BRL's minor unit) — e.g. R$31.44 is stored as `3144`.
- `users.spread` is stored as `INTEGER` basis points — e.g. 0.6% is stored as `60`, 1% as
  `100`, 0% as `0`.

All arithmetic (the pricing formula, rounding) happens in application code using a decimal library so intermediate
division/multiplication never touches floating-point `number`, and only the final rounded-up-to-2-decimals result is
converted to its integer minor-unit form at the point it's persisted. This keeps SQLite's native INTEGER SUM/compare
exact for anything aggregate we build later (e.g. history totals), which was the deciding factor over storing decimal
strings in TEXT columns.

I considered Prisma but chose better-sqlite3 with a small hand-rolled migration runner instead. The database is a single
SQLite file with three simple tables — Prisma's main value-adds (relation loading, multi-provider portability, generated
query builder) don't get exercised at this scale. It also would have added real friction: the supported_currencies CHECK
constraint isn't expressible in Prisma's schema DSL, requiring a hand-edited raw-SQL migration anyway, and Prisma's
query engine binary adds Docker binary-targeting complexity we don't need. better-sqlite3 is synchronous (simpler for
the atomic quote-confirmation update in ticket 2-2) and a lightweight runner gives us the same idempotent-migration
guarantee with far less code to maintain.

The first schema has User and SupportedCurrency. We also have Quote, which is an expirable record for a user's attempt
at buying new currency. It saves how much the user wants to spend and what would that yield, at that moment, for that
duration.

Created sessions table with the users sessions. It is a simple UUID for the token and the users don't have password.

## Epic 3 Market Data and Exchange Integration

The challenge requires that quotations are valid for 10 seconds after their creation.
Challenge also states that Binance is to be queried always by REST and OKX via WebSocket.
OKX may be requested by REST if the WebSocket is unavailable in 1 second intervals.
USDT / BRL conversion checks the cheapest one from Binance or OKX.
The USDT/<other curency> part must always come from Binance.

I understand the requirement for OKX WebSocket, since it notifies me. I understand that Binance also offers websocket,
but, for the purpose of this challenge, we're not using it.

I understand Binance is the determining factor here, if there is no Binance, there is no deal.

However, one point to consider is, what if we have 200 users asking for a quote? Then would we actually send 200
requests? It could be 1 user frenetically clicking away, then again, would we really make a REST request every time to
Binance? I haven't even read the specs on how many requests I'm allowed to make, but I know it is not infinite.

So it makes sense to have a cache also for Binance, even if it is not exactly equal to the cache we're implementing for
OKX. when a value for a given key (the resolved exchange-info symbol map, or a symbol's book ticker) is requested, an
already in-flight request for that key is shared instead of firing a second one, and once a request resolves — success
or typed failure alike — its result stays cached for a short TTL (1 second for book-ticker bid/ask, comfortably inside a
quote's 10-second validity window; 10 minutes for exchange-info symbol resolution, since trading pairs don't change
between requests).

One refinement on the above: only a successful symbol resolution is cached for 10 minutes. A failed one is cached for 1
second, same as prices. Concurrent callers during an outage still share a single request, so the rate limit holds, but
one transient 503 can't leave us unable to quote for 10 minutes after Binance is already back.

An alternative to this would be some sort of fixed-interval background job, however this would be firing requests when
no one is asking for a quote.

There was a change of plans here though. I was going to reuse the Simulated Mode fakes to test the exchange-client
tests. However, doing this I wouldn't be able to properly test BinanceClients (malformed JSON, non-OK status, timeouts,
request coalescing). So they are going to have their own comprehensive tests.

I haven't anticipated one thing though: how long should I wait before thinking that a Websocket may be stale? I
considered a fixed interval less than 10s, like 5s for instance. However, this may throw away a perfectly good
connection, because from what I understand from OKX they do not send a message if there is no change.

So I got into the concept of 2 checks:  Liveliness checks and Freshness checks:

OKX connection health needs two timers, not one. The tickers channel is change-driven, so silence on a thin pair like
USDT/BRL is normal and cannot be used as a failure signal: a data-silence alarm degenerates into a reconnect loop and
leaves us on REST permanently, defeating the WebSocket requirement. Liveness is therefore proven with OKX's own
keepalive (a literal "ping" after 5s of silence on any frame, reconnect if no frame follows within 3s, worst case 8s,
inside OKX's 30s idle close), and freshness is a separate per-read guard on the price age measured from the exchange
timestamp. REST polling at 1s is driven by price age, reconnects are driven by liveness, and the two never trigger each
other.

Obs: Worst-case detection of a silently dead connection is up to 10 seconds, not 8, because the health check runs on a
one-second tick

There is now a variable called EXCHANGE_MODE that may be live or simulated to toggle between the fake servers.

FakeExchangeClient.ts holds the shared in-memory lookup: no fetch, no WebSocket, no timers anywhere in the hierarchy.
FakeBinanceClient.ts serves USDT against BRL and all five destination currencies, with the real client's wording for an
unknown pair.
FakeOkxClient.ts serves only USDT/BRL, at an ask slightly below the Binance fake, so simulated mode exercises the branch
where OKX wins the BRL leg.
exchangeClients.ts resolves the toggle once at process start and is the only place that knows both implementations
exist.

## Epic 4 Quotation Business Logic

From the example in the challenge, If you divide R$31.44 by 100 MXN this gives the 0.3144 MXN, not an integer. I also
can't just round it up to 0.32, the results wouldn't add up in the end (31.44 != 32). So I had to change unit price

So quotes.unit_price is BRL scaled by 10^8 sub-units — 0.00314375 BRL per destination minor unit is stored as 314375.
No DDL change was needed, the column was already INTEGER and SQLite's 64-bit range is orders of magnitude wider than
anything this can hold.

One caveat on unit_price. The division can be non-terminating (ask 5.00 over bid 3.00), so 8 decimal places is still a
rounded figure, not an exact one. I round it up at the storage scale, so no rounding step anywhere in the system ever
understates the cost. What matters more is that unit_price is a record of the rate and nothing else: total_price is
always computed from the full-precision decimal chain, never by multiplying the stored unit_price back out.

Main domain changes:

```
quotes.quantity = destination currency minor units
quotes.unit_price is BRL sub-units at 10^8
quotes.total_price = centavos, unchanged
users.spread = integer, left unaltered
```

Added the pricing module: ask over bid, spread on top of that composed rate, rate times quantity, ceiling applied once
at the end on the total.

Quotes are valid for 10 seconds, so timestamps have to be unambiguous. SQLite's `datetime('now')` default gives
`YYYY-MM-DD HH:MM:SS` with no timezone, and JavaScript reads that as local time, which would shift the window by the
server's UTC offset. So `created_at` is still a TEXT column, but the application writes it from its own clock as an ISO
8601 UTC string, the same format as `expires_at`. Both come from a single clock reading, so the window is exactly 10_000ms.
Expiry is decided by `expires_at` alone. A quote is still valid at exactly `expires_at` and expired one millisecond later.

-- TODO: I've researched more about this and that's not quite what 0 would mean
Exchanges can report a price of zero, which means an empty side of the order book, not a free currency. The clients only
reject negative prices, so the market data service now treats a zero or non-finite price as unusable. For Binance (the
USDT/BRL ask or the destination bid) that means no quote capability. For OKX it means OKX is unavailable, so we fall back
to Binance instead of treating zero as the cheapest ask. This touches availability logic from Epic 3, but it's the only
place the OKX fallback can be handled correctly.

-- TODO: I'll impose a limit based on the integer representation
A quantity must be a positive whole number of minor units, but even a valid one can produce a total too large to store as
an exact integer. I didn't want to invent a maximum order size the challenge doesn't ask for, so a quote whose total
overflows is rejected as an invalid quantity rather than crashing the request.
