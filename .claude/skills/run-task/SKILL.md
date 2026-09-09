---
description: Implements a single ticket and verifies it against its acceptance criteria
disable-model-invocation: true
argument-hint: <ticket-number-or-file>
---

## Ticket to implement

`cat business/tickets/*${ARGUMENTS}* 2>/dev/null`

## Prior decisions

`cat DECISIONS.md 2>/dev/null`

Implement the ticket above:

1. Check the ticket's `Dependencies` — if one hasn't been implemented yet, stop and tell the user instead of proceeding out of order.
2. Stay inside the ticket's `Scope` and respect its `Out of scope`; don't pull in work that belongs to another ticket.
3. Follow `DECISIONS.md` for any prior architectural/technical choices and stay consistent with them. It is read-only — never edit it. If the ticket requires a decision that hasn't been made yet, ask the user rather than deciding it yourself.
4. If anything in the ticket is ambiguous or underspecified, ask the user rather than assuming (per `CLAUDE.md`).
5. Implement the code in `backend/` or `frontend/` as appropriate.
6. Work through `done.md` in this skill directory before considering the ticket finished.

Report back which acceptance criteria are met, which aren't, and any deviations from the ticket.
