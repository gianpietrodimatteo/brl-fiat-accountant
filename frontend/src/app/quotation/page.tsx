"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  confirmQuote,
  createQuote,
  listCurrencies,
  type ApiResult,
  type Currency,
  type QuoteResponse,
} from "@/lib/api";
import {
  formatBrl,
  formatQuantity,
  formatTimestamp,
  formatUnitPrice,
  parseQuantity,
} from "@/lib/amounts";
import { useSession } from "@/lib/session";

/**
 * Every amount on this screen is the backend's integer, only formatted here. Expiry is the
 * backend's call alone: there is no countdown and no clock check, so Confirm stays available until
 * a confirm response says otherwise.
 */

type CurrenciesState =
  { status: "loading" } | { status: "failed" } | { status: "loaded"; currencies: Currency[] };

type CreateFailure =
  | { kind: "invalid_quantity" }
  | { kind: "unsupported_currency" }
  | { kind: "quantity_too_large"; maxQuantity: number; currency: string }
  | { kind: "no_quote_capability" }
  | { kind: "unreachable" }
  | { kind: "unexpected" };

type ConfirmOutcome =
  | { kind: "confirmed"; confirmedAt: string }
  | { kind: "expired" }
  | { kind: "already_confirmed" }
  | { kind: "not_found" }
  | { kind: "unreachable" }
  | { kind: "unexpected" };

const UNREACHABLE_MESSAGE = "Couldn't reach the server. Please try again.";
const UNEXPECTED_MESSAGE = "Something went wrong. Please try again.";

function createFailureMessage(failure: CreateFailure): string {
  switch (failure.kind) {
    case "invalid_quantity":
      return "Enter a quantity greater than zero, with at most 2 decimals.";
    case "unsupported_currency":
      return "That currency isn't supported. Choose another one.";
    case "quantity_too_large":
      return `That quantity is too large. The largest you can quote is ${formatQuantity(failure.maxQuantity)} ${failure.currency}.`;
    case "no_quote_capability":
      return "Quotes are temporarily unavailable. Please try again in a moment.";
    case "unreachable":
      return UNREACHABLE_MESSAGE;
    case "unexpected":
      return UNEXPECTED_MESSAGE;
  }
}

function toCreateFailure(
  result: Extract<ApiResult<QuoteResponse>, { ok: false }>,
  currency: string,
): CreateFailure {
  const { error } = result;
  if (error.kind === "network_error") {
    return { kind: "unreachable" };
  }
  switch (error.code) {
    case "invalid_quantity":
    case "unsupported_currency":
    case "no_quote_capability":
      return { kind: error.code };
    case "quantity_too_large":
      // The API client only lets this code through with a safe-integer `maxQuantity`.
      return { kind: "quantity_too_large", maxQuantity: error.details.maxQuantity!, currency };
    default:
      return { kind: "unexpected" };
  }
}

function toConfirmOutcome(result: Awaited<ReturnType<typeof confirmQuote>>): ConfirmOutcome {
  if (result.ok) {
    return { kind: "confirmed", confirmedAt: result.data.confirmedAt };
  }
  const { error } = result;
  if (error.kind === "network_error") {
    return { kind: "unreachable" };
  }
  switch (error.code) {
    case "quote_expired":
      return { kind: "expired" };
    case "quote_already_confirmed":
      return { kind: "already_confirmed" };
    case "quote_not_found":
      return { kind: "not_found" };
    default:
      return { kind: "unexpected" };
  }
}

/** Only a failure worth retrying keeps Confirm on screen. */
function isFinal(outcome: ConfirmOutcome | null): boolean {
  return outcome !== null && outcome.kind !== "unreachable" && outcome.kind !== "unexpected";
}

export default function QuotationPage() {
  const { authenticated } = useSession();
  const [currencies, setCurrencies] = useState<CurrenciesState>({ status: "loading" });
  const [currency, setCurrency] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [creating, setCreating] = useState(false);
  const [createFailure, setCreateFailure] = useState<CreateFailure | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmOutcome, setConfirmOutcome] = useState<ConfirmOutcome | null>(null);

  useEffect(() => {
    let ignore = false;
    listCurrencies().then((result) => {
      if (!ignore) {
        setCurrencies(
          result.ok ? { status: "loaded", currencies: result.data } : { status: "failed" },
        );
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  async function retryCurrencies() {
    setCurrencies({ status: "loading" });
    const result = await listCurrencies();
    setCurrencies(result.ok ? { status: "loaded", currencies: result.data } : { status: "failed" });
  }

  const parsed = parseQuantity(quantityText);
  const busy = creating || confirming;
  const canCreate = currency !== "" && parsed.ok && !busy;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) {
      return;
    }
    const destinationCurrency = currency;
    setCreating(true);
    // A new attempt replaces whatever is on screen, including a confirm or expired message.
    setCreateFailure(null);
    setQuote(null);
    setConfirmOutcome(null);

    const result = await authenticated((token) =>
      createQuote(token, { destinationCurrency, quantity: parsed.quantity }),
    );
    if (result.ok) {
      setQuote(result.data);
    } else {
      setCreateFailure(toCreateFailure(result, destinationCurrency));
    }
    setCreating(false);
  }

  async function handleConfirm() {
    if (quote === null || busy) {
      return;
    }
    const { id } = quote;
    setConfirming(true);
    setConfirmOutcome(null);

    const result = await authenticated((token) => confirmQuote(token, id));
    setConfirmOutcome(toConfirmOutcome(result));
    setConfirming(false);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">New quote</h1>

      <form onSubmit={handleCreate} className="flex flex-col gap-3">
        <label htmlFor="currency" className="text-sm">
          Currency
        </label>
        <select
          id="currency"
          name="currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          disabled={currencies.status !== "loaded"}
          className="rounded border border-foreground/20 bg-transparent px-3 py-2 disabled:opacity-50"
        >
          <option value="">
            {currencies.status === "loading" ? "Loading currencies…" : "Select a currency"}
          </option>
          {currencies.status === "loaded" &&
            currencies.currencies.map(({ code, name }) => (
              <option key={code} value={code}>
                {name === null ? code : `${code} — ${name}`}
              </option>
            ))}
        </select>
        {currencies.status === "failed" && (
          <div role="alert" className="flex items-center gap-3 text-sm text-red-600">
            <p>Couldn&apos;t load the currencies.</p>
            <button type="button" onClick={retryCurrencies} className="underline">
              Retry
            </button>
          </div>
        )}

        <label htmlFor="quantity" className="text-sm">
          Quantity
        </label>
        <input
          id="quantity"
          name="quantity"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="100.00"
          value={quantityText}
          onChange={(event) => setQuantityText(event.target.value)}
          className="rounded border border-foreground/20 bg-transparent px-3 py-2"
        />

        <button
          type="submit"
          disabled={!canCreate}
          className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
        >
          Create quote
        </button>
        {createFailure !== null && (
          <p role="alert" className="text-sm text-red-600">
            {createFailureMessage(createFailure)}
          </p>
        )}
      </form>

      {quote !== null && (
        <section
          aria-label="Quote"
          className="flex flex-col gap-3 rounded border border-foreground/20 p-4"
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt>Currency</dt>
            <dd>{quote.destinationCurrency}</dd>
            <dt>Quantity</dt>
            <dd>{formatQuantity(quote.quantity)}</dd>
            <dt>Unit price</dt>
            <dd>{formatUnitPrice(quote.unitPrice)}</dd>
            <dt>Total price</dt>
            <dd className="font-semibold">{formatBrl(quote.totalPrice)}</dd>
            <dt>Expires at</dt>
            <dd>{formatTimestamp(quote.expiresAt)}</dd>
          </dl>

          {!isFinal(confirmOutcome) && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
            >
              Confirm
            </button>
          )}
          {confirmOutcome !== null && <ConfirmMessage outcome={confirmOutcome} />}
        </section>
      )}
    </div>
  );
}

function ConfirmMessage({ outcome }: { outcome: ConfirmOutcome }) {
  switch (outcome.kind) {
    case "confirmed":
      return (
        <p role="status" className="text-sm text-green-700">
          Quote confirmed at {formatTimestamp(outcome.confirmedAt)}.
        </p>
      );
    case "expired":
      return (
        <p role="alert" className="text-sm text-red-600">
          This quote has expired. Create a new quote to get a current price.
        </p>
      );
    case "already_confirmed":
      return (
        <p role="alert" className="text-sm text-red-600">
          This quote was already confirmed.
        </p>
      );
    case "not_found":
      return (
        <p role="alert" className="text-sm text-red-600">
          This quote could not be found. Create a new quote.
        </p>
      );
    case "unreachable":
      return (
        <p role="alert" className="text-sm text-red-600">
          {UNREACHABLE_MESSAGE}
        </p>
      );
    case "unexpected":
      return (
        <p role="alert" className="text-sm text-red-600">
          {UNEXPECTED_MESSAGE}
        </p>
      );
  }
}
