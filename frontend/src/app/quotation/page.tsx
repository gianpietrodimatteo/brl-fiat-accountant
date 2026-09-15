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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New quote</h1>
        <p className="mt-1 text-sm text-muted">Priced in BRL, bridged through USDT.</p>
      </div>

      <form onSubmit={handleCreate} className={`flex flex-col gap-5 ${CARD_CLASS}`}>
        <div className="flex flex-col gap-2">
          <label htmlFor="currency" className={LABEL_CLASS}>
            Currency
          </label>
          <select
            id="currency"
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            disabled={currencies.status !== "loaded"}
            className={`${FIELD_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
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
            <div role="alert" className={`flex items-center justify-between ${ALERT_CLASS}`}>
              <p>Couldn&apos;t load the currencies.</p>
              <button
                type="button"
                onClick={retryCurrencies}
                className="font-medium underline underline-offset-4 hover:text-foreground"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="quantity" className={LABEL_CLASS}>
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
            className={`${FIELD_CLASS} font-mono placeholder:text-muted/50`}
          />
        </div>

        <button type="submit" disabled={!canCreate} className={PRIMARY_BUTTON_CLASS}>
          Create quote
        </button>
        {createFailure !== null && (
          <p role="alert" className={ALERT_CLASS}>
            {createFailureMessage(createFailure)}
          </p>
        )}
      </form>

      {quote !== null && (
        <section
          aria-label="Quote"
          className={`flex flex-col gap-5 ${CARD_CLASS} border-accent/30`}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted">Currency</dt>
            <dd className="text-right font-medium">{quote.destinationCurrency}</dd>
            <dt className="text-muted">Quantity</dt>
            <dd className="text-right font-mono tabular-nums">{formatQuantity(quote.quantity)}</dd>
            <dt className="text-muted">Unit price</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatUnitPrice(quote.unitPrice)}
            </dd>
            <dt className="text-muted">Expires at</dt>
            <dd className="text-right">{formatTimestamp(quote.expiresAt)}</dd>
            <dt className="self-center border-t border-line pt-3 text-muted">Total price</dt>
            <dd className="border-t border-line pt-3 text-right font-mono text-2xl font-semibold tabular-nums">
              {formatBrl(quote.totalPrice)}
            </dd>
          </dl>

          {!isFinal(confirmOutcome) && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className={PRIMARY_BUTTON_CLASS}
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

const CARD_CLASS = "rounded-xl border border-line bg-surface p-6 shadow-2xl shadow-black/40";
const LABEL_CLASS = "text-xs font-medium uppercase tracking-wider text-muted";
const FIELD_CLASS =
  "rounded-md border border-line bg-background px-3 py-2.5 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const PRIMARY_BUTTON_CLASS =
  "rounded-md bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40";
const ALERT_CLASS =
  "gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger";

function ConfirmMessage({ outcome }: { outcome: ConfirmOutcome }) {
  switch (outcome.kind) {
    case "confirmed":
      return (
        <p
          role="status"
          className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"
        >
          Quote confirmed at {formatTimestamp(outcome.confirmedAt)}.
        </p>
      );
    case "expired":
      return (
        <p role="alert" className={ALERT_CLASS}>
          This quote has expired. Create a new quote to get a current price.
        </p>
      );
    case "already_confirmed":
      return (
        <p role="alert" className={ALERT_CLASS}>
          This quote was already confirmed.
        </p>
      );
    case "not_found":
      return (
        <p role="alert" className={ALERT_CLASS}>
          This quote could not be found. Create a new quote.
        </p>
      );
    case "unreachable":
      return (
        <p role="alert" className={ALERT_CLASS}>
          {UNREACHABLE_MESSAGE}
        </p>
      );
    case "unexpected":
      return (
        <p role="alert" className={ALERT_CLASS}>
          {UNEXPECTED_MESSAGE}
        </p>
      );
  }
}
