# Ticket 7-4: DECISIONS.md & Commit History Audit

## Epic
Epic 7: Documentation & Delivery

## Context
The challenge asks for a `DECISIONS.md` recording each relevant technical decision with the alternative rejected and why. It also asks that every added dependency be justified there, that the Binance rate-limit approaches considered be recorded, and that the delivery be a public GitHub repo with a real, incremental commit history. This is the last ticket, so the audit covers everything, including decisions made in tickets 7-1 to 7-3. `DECISIONS.md` is read-only for the implementer ([[feedback_rules_and_decisions]]), so this ticket produces a gap report with drafted text for the user to paste. It does not edit the file.

## Scope
- **Decision completeness.** Go through `DECISIONS.md` against the codebase and the challenge (`Desafio.html`). For each notable decision, check it states what was chosen, the alternative rejected, and why. At minimum, check:
  - Node + TypeScript, Next.js, SQLite, npm
  - better-sqlite3 vs Prisma
  - integer minor units vs decimal strings
  - pricing as an exact fraction
  - Binance request coalescing + TTL cache vs a fixed-interval background job
  - OKX liveness vs freshness
  - `EXCHANGE_MODE` as the Simulated Mode toggle
  - Fastify vs Express
  - wire format
  - Bearer token in `sessionStorage`
  - Vitest vs Jest
  - Playwright
  - no coverage threshold
- **Dependency justification.** Check every entry in `dependencies` and `devDependencies` of `backend/`, `frontend/` and `e2e/` `package.json`. Each one is justified in `DECISIONS.md`, or listed in the report as missing. Standard tooling can be justified as a group (e.g. ESLint/Prettier/typescript-eslint). Candidates noticed while writing this ticket, still to be verified:
  - `@fastify/ajv-compiler`
  - `@fastify/cors`
  - `tsx`
  - `tailwindcss` / `@tailwindcss/postcss`
  - `jsdom` and the Testing Library packages
  - `@vitejs/plugin-react`
- **Accuracy.** Flag statements that contradict the code or each other. For example, Epic 2 describes SQLite INTEGER as "64-bit unsigned", while Epic 4 correctly gives its range as 2^63−1. Also flag decisions whose stated plan changed without a follow-up note, such as the Epic 1 plan to reuse the fakes for exchange-client tests, which Epic 3 revises. Note typos only as a short, separate list.
- **Challenge ambiguities.** Check that each ambiguity the implementation resolved is recorded, per the challenge's instruction to document such decisions. Examples: newest-first meaning most recently confirmed, expiry being inclusive at `expires_at`, EUR's reversed pair, quantity input in currency units with 2 decimals.
- **Commit history.** Check with `git log`, `git show --stat`, `git ls-files` and `gh repo view`:
  - the history is incremental: no single commit adds the bulk of the application
  - no secrets, `.env` files, SQLite database files, `node_modules`, build output or Playwright reports are tracked, or were ever committed
  - `main` is pushed to `origin` (`github.com/gianpietrodimatteo/brl-fiat-accountant`) with nothing unpushed
  - the repository's visibility is public
- **Report to the user**, in the session:
  1. missing or incomplete decisions, each with drafted `DECISIONS.md` text in the file's existing first-person voice and the section it belongs in
  2. unjustified dependencies, with drafted justifications
  3. inaccuracies with suggested corrections
  4. commit-history findings

## Out of scope
- Editing `DECISIONS.md`. Only the user edits it.
- Rewriting git history (rebase, squash, amend, force-push) or changing repository visibility. Problems found are reported, and the user decides.
- README changes (ticket 7-2) and code changes of any kind
- Re-arguing decisions already made. The audit checks that they are recorded and justified, not whether they were right.

## Acceptance Criteria
- [ ] The report lists every package from the three `package.json` files, each marked "justified" (with where in `DECISIONS.md`) or "missing" (with drafted justification text)
- [ ] Every decision in the Scope checklist is marked present-and-complete, present-but-missing-alternative/rationale, or absent, with drafted text for the last two
- [ ] The report confirms or refutes each commit-history check with the command used and its output (tracked-file check, largest commits by `--stat`, `git status -sb` showing no unpushed commits, `gh repo view --json visibility`)
- [ ] Drafted text keeps `DECISIONS.md`'s existing voice and names the section each piece should go in
- [ ] `git diff` and `git log` show no change to `DECISIONS.md` and no rewritten history from this ticket

## Dependencies
Ticket 7-1 (Playwright E2E Suite in Simulated Mode), Ticket 7-2 (README Delivery Pass), Ticket 7-3 (Live-Mode Checklist & Final Sanity Run). It runs last so it audits the final state of the repo.
