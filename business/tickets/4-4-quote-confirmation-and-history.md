# Ticket 4-4: Exactly-Once Confirmation & Confirmed-Quote History

## Epic
Epic 4: Quotation Business Logic

## Context
Quotes from [[4-3]] exist but can't yet be accepted. This ticket closes the lifecycle: a quote is confirmable exactly once, only by its owner, only inside its 10-second window, and a confirmed quote is what the user's history shows. [[2-2]] already provides an atomic confirm; this ticket adds the expiry guarantee on top of it and the read path Epic 5's history endpoint calls.

## Scope
- A `confirmQuote({ userId, quoteId })` operation on [[4-3]]'s quote service returning a discriminated result: confirmed, already confirmed, expired, not found, not the caller's quote.
- Fold the expiry check into the atomic write rather than checking then writing. `QuoteRepository.confirmQuote` currently guards only on `confirmed_at IS NULL`; extend that single `UPDATE` so it also requires the quote to be unexpired (and to belong to the caller), so a quote that expires between the read and the write cannot be confirmed. A read-then-write in service code does not satisfy [[business]]'s requirement for a real concurrency guarantee.
- The repository must still distinguish why a write matched nothing — already confirmed, expired, wrong owner, or absent — so the service can return the right result without a second race.
- Per [[business]], an expired confirmation attempt is rejected and recorded nowhere: `confirmed_at` stays `NULL`, no row is inserted anywhere, and the quote never appears in history.
- A `listHistory(userId)` operation returning that user's confirmed quotes, newest first, with the monetary fields converted out of their integer minor units via [[4-1]]'s helpers so Epic 5 only has to shape the response.
- History is per-user: a confirmed quote belonging to another user is never returned.

## Out of scope
- Quote creation, pricing, the expiry window's definition (tickets 4-2, 4-3 — reuse [[4-3]]'s predicate and TTL constant)
- Deleting or garbage-collecting expired quotes — they simply stay unconfirmed
- HTTP routes, status codes, response bodies, session-to-user resolution (Epic 5)
- Frontend history display (Epic 6)

## Acceptance Criteria
- [ ] Two `confirmQuote` calls for the same quote issued concurrently (e.g. `Promise.all`) yield exactly one confirmed result and one already-confirmed result, and the database holds exactly one row with a non-null `confirmed_at`
- [ ] The same assertion holds for a burst of ten concurrent confirmations of one quote
- [ ] Confirming a quote past its `expires_at` (driven by the injected clock from [[4-3]]) returns the expired result, leaves `confirmed_at` `NULL`, and leaves the quote absent from `listHistory`
- [ ] The expiry condition is part of the same SQL statement as the `confirmed_at IS NULL` guard — verifiable by reading the repository method, and covered by a test where the clock advances past expiry between fetching the quote and confirming it
- [ ] Confirming a quote that belongs to another user returns the not-the-caller's-quote result, does not confirm it, and does not reveal the quote's contents
- [ ] Confirming a non-existent quote id returns the not-found result without throwing
- [ ] A successfully confirmed quote appears in `listHistory` for its owner with the same amounts that were quoted, and never in another user's history
- [ ] `listHistory` returns confirmed quotes newest first and excludes unconfirmed and expired-unconfirmed quotes
- [ ] `listHistory` returns an empty list, not an error, for a user with no confirmed quotes
- [ ] `confirmQuote` never throws for any rejection path above
- [ ] Tests (Vitest, colocated per [[backend]]) run against a real SQLite database per [[backend]]'s repository-testing convention, with the Simulated Mode fakes from [[3-4]] standing in for the exchanges
- [ ] `npm run lint` and `npm run format:check` pass in `backend/`
- [ ] `npm test` passes in `backend/`

## Dependencies
Ticket 4-3 (Quote Creation & 10-Second Lifecycle)
