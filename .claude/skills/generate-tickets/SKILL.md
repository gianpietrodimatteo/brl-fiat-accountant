---
description: Breaks an epic down into a small set of implementation tickets
disable-model-invocation: true
argument-hint: <epic-number-or-file>
---

## Epic to break down

!`cat business/epics/*${ARGUMENTS}* 2>/dev/null`

Break the epic above into a small number of tickets (aim for 3-6; do not over-fragment).

Each ticket must:

1. Have a single, clearly bounded responsibility that fits in one implementation session
2. Stay inside the epic's `Scope` and respect its `Out of scope` — don't invent work that belongs to another epic
3. Declare its `Dependencies` (other tickets, in this epic or earlier ones) so build order is unambiguous
4. Have concrete, testable acceptance criteria — not vague statements like "works correctly"

Use template.md in this skill directory for the exact ticket format.

Write each ticket as its own file in `business/tickets/`, named `<epic-number>-<ticket-number>-<slug>.md` (e.g. `2-1-sqlite-schema-and-migrations.md`), numbered in the order they should be built.

Report back the list of ticket files created with a one-line summary of each.
