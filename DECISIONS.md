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

Added ESLint and Prettier (plus eslint-config-prettier deal with conflicts)
Now I can lint and format with prettier on both projects. Both resolve to the single root for the style. Classic default
settings.
