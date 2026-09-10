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

