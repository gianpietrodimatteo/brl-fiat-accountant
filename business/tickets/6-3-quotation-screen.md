# Ticket 6-3: Quotation Screen — Create, Confirm & Expired-Quote Messaging

## Epic
Epic 6: Frontend Application

## Context
This is the challenge's main screen: pick a destination currency, type a quantity, create a quote, see its price, and confirm it. Confirming after the deadline shows that the quote expired. Every number shown comes from the backend ([[5-3]], [[5-4]]). The screen only formats amounts through [[6-1]]'s helpers and never prices, per [[frontend]].

## Scope
- `/quotation` (authenticated via [[6-2]]):
  - a currency select populated from `listCurrencies()`, showing the code and the name when it isn't null. No hardcoded currency list.
  - a quantity input in **major units** (up to 2 decimals), converted with `parseQuantity`. Create is disabled while no currency is selected, the input doesn't parse, or a request is in flight.
  - a Create quote action that calls `createQuote`
- On `201`, show the created quote:
  - currency and quantity (`formatQuantity`)
  - unit price (`formatUnitPrice`)
  - total price (`formatBrl`)
  - the expiry time (`formatTimestamp(expiresAt)`)
  - a **Confirm** button
- Expiry is decided by the backend only. There is no countdown and no client-side clock check, and Confirm stays enabled until a response says otherwise.
- Confirm calls `confirmQuote(token, id)`, which sends no body and no `Content-Type` per [[6-1]]. Confirm is disabled while its request is in flight. Outcomes:
  - `200` → a confirmed message (with `confirmedAt`), Confirm removed
  - `410 quote_expired` → **a clear "this quote has expired" message**, Confirm removed, and the user can create a new quote
  - `409 quote_already_confirmed` → an already-confirmed message, Confirm removed
  - `404 quote_not_found` → a quote-not-found message, Confirm removed
  - `network_error` → a retryable message, Confirm stays available. A retry that lands after the deadline gets `410` like any other.
- Create-quote failures, each shown as a message next to the form and never as a crash or blank screen:
  - `400 invalid_quantity` and `400 unsupported_currency`
  - `422 quantity_too_large` → a message including the largest allowed quantity (`formatQuantity(maxQuantity)`)
  - `503 no_quote_capability` → quotes temporarily unavailable, try again
  - `network_error`
- Creating a new quote replaces the one on screen, along with any confirm or expired message.
- A `listCurrencies` failure shows a message with a retry, instead of an empty select that looks like "no currencies".

## Out of scope
- Any price, spread, rounding or expiry computation in the browser, per [[frontend]] and [[business]]
- A countdown timer or disabling Confirm locally when `expiresAt` passes (decided: the backend's `410` is the only expiry signal)
- The history list (ticket 6-4)
- Session handling and the `401` redirect (ticket 6-2): reused, not re-implemented

## Acceptance Criteria
- [ ] The currency select lists exactly the currencies returned by the mocked `listCurrencies()`, and a response with a different set renders that set (nothing hardcoded)
- [ ] Choosing MXN and typing `100` calls `createQuote` with `{ destinationCurrency: "MXN", quantity: 10000 }`; typing `100.50` sends `10050`
- [ ] Create is disabled for an empty, non-numeric, zero, negative or 3-decimal quantity and with no currency selected, and a double click sends one request
- [ ] A mocked `201` with `totalPrice: 3144`, `unitPrice: 314375`, `quantity: 10000` renders `R$ 31.44`, `R$ 0.314375` and `100.00`, plus a Confirm button
- [ ] Clicking Confirm calls `confirmQuote` with the quote's `id`; a mocked `200` shows a confirmed message and removes Confirm
- [ ] A mocked `410 quote_expired` on confirm shows an expired-quote message, removes Confirm, and leaves the form usable for a new quote
- [ ] Mocked `409` and `404` on confirm each show their own message and remove Confirm; a mocked `network_error` shows a retry message and keeps Confirm
- [ ] Mocked create failures `400 invalid_quantity`, `400 unsupported_currency`, `422 quantity_too_large` (with `maxQuantity: 12345` shown as `123.45`), `503 no_quote_capability` and `network_error` each show a distinct message and no quote card
- [ ] The component has no timer (`setTimeout`/`setInterval`) and never compares `expiresAt` with the current time
- [ ] Manual check with `npm run dev` against the backend in Simulated Mode: as `bob`, 100 MXN at the simulated prices shows the backend's total. Confirming within 10 s shows confirmed. Creating another quote and waiting over 10 s before Confirm shows the expired message. The browser's network panel shows the confirm request without `Content-Type` and with a non-`400` response.
- [ ] Component tests (Vitest + RTL, colocated) mock [[6-1]]'s API client module, not `fetch`, per [[frontend]]
- [ ] `npm run lint`, `npm run format:check`, `npm run build` and `npm test` pass in `frontend/`

## Dependencies
Ticket 6-2 (Client Session State, Login Screen & Route Guarding), Ticket 5-3 (Supported Currencies & Create-Quote Endpoints), Ticket 5-4 (Confirm-Quote & Confirmed-Quote History Endpoints)
