# Ticket 6-4: Confirmed-Quote History Screen

## Epic
Epic 6: Frontend Application

## Context
The challenge's history screen lists the authenticated user's confirmed quotes with currency, quantity, unit price, total price and date/time. There are no filters and no pagination. [[5-4]] already returns exactly those quotes, newest first, as integer minor units. This screen renders them through [[6-1]]'s formatting helpers.

## Scope
- `/history` (authenticated via [[6-2]]) calls `listHistory(token)` on mount.
- A table (or equivalent list) with one row per returned quote, **in the order the API returns them** (newest confirmation first) and with no client-side re-sorting. Columns:
  - currency (`destinationCurrency`)
  - quantity (`formatQuantity`)
  - unit price (`formatUnitPrice`)
  - total price (`formatBrl`)
  - date/time: `confirmedAt` via `formatTimestamp`. This is a confirmed-quote history, so the confirmation instant is the one shown.
- An empty list shows a "no confirmed quotes yet" message, not an empty table.
- A loading state while the request is pending. A `network_error` or unexpected error shows a message with a retry, never a crash. A `401` goes through [[6-2]]'s shared handling.
- Nothing else: no filters, no pagination, no sorting controls, no total, per the epic.

## Out of scope
- Any total or sum across quotes. Per the epic, if one is ever wanted it comes from the backend, because a browser-side sum of `number`s can pass 2^53 − 1 and lose precision.
- Filters, pagination, sorting or search, which the spec excludes
- Showing unconfirmed or expired quotes (the backend already excludes them)
- The quotation flow (ticket 6-3) and session handling (ticket 6-2)

## Acceptance Criteria
- [ ] With `listHistory` mocked to return two items, the screen renders two rows in the same order, each showing currency, quantity, unit price, total price and date/time
- [ ] An item with `quantity: 10000`, `unitPrice: 314375`, `totalPrice: 3144` renders `100.00`, `R$ 0.314375` and `R$ 31.44`, and its date/time comes from `confirmedAt`, not `createdAt`
- [ ] A mocked empty list shows the no-confirmed-quotes message and no table rows
- [ ] A mocked `network_error` shows an error message with a retry that calls `listHistory` again and renders the rows on success
- [ ] The rendered screen contains no filter, pagination, sort control or total, and the component never adds amounts together (no reduce/sum over amounts in the diff)
- [ ] Manual check with `npm run dev` against the backend in Simulated Mode: after confirming a quote on `/quotation`, following the header link to `/history` shows it at the top with the same total as on the quotation screen
- [ ] Component tests (Vitest + RTL, colocated) mock [[6-1]]'s API client module, not `fetch`, per [[frontend]]
- [ ] `npm run lint`, `npm run format:check`, `npm run build` and `npm test` pass in `frontend/`

## Dependencies
Ticket 6-2 (Client Session State, Login Screen & Route Guarding), Ticket 5-4 (Confirm-Quote & Confirmed-Quote History Endpoints). Ticket 6-3 is not required to build it, but the manual check above needs a confirmed quote, so build it after 6-3.
