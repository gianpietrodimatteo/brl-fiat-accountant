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
