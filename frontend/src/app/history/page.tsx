"use client";

import { useEffect, useState } from "react";
import { listHistory, type ApiResult, type HistoryItem } from "@/lib/api";
import { formatBrl, formatQuantity, formatTimestamp, formatUnitPrice } from "@/lib/amounts";
import { useSession } from "@/lib/session";

/**
 * The backend's confirmed quotes, one row each, in the order it sends them (newest confirmation
 * first). Amounts are only formatted: nothing is sorted, filtered or added up here.
 */

type HistoryState =
  | { status: "loading" }
  | { status: "failed"; reason: "unreachable" | "unexpected" }
  | { status: "loaded"; quotes: HistoryItem[] };

function toHistoryState(result: ApiResult<HistoryItem[]>): HistoryState {
  if (result.ok) {
    return { status: "loaded", quotes: result.data };
  }
  // A 401 has already cleared the session by now, and the shell is on its way to /login.
  return {
    status: "failed",
    reason: result.error.kind === "network_error" ? "unreachable" : "unexpected",
  };
}

export default function HistoryPage() {
  const { authenticated } = useSession();
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });

  useEffect(() => {
    let ignore = false;
    authenticated((token) => listHistory(token)).then((result) => {
      if (!ignore) {
        setHistory(toHistoryState(result));
      }
    });
    return () => {
      ignore = true;
    };
  }, [authenticated]);

  async function retry() {
    setHistory({ status: "loading" });
    setHistory(toHistoryState(await authenticated((token) => listHistory(token))));
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Confirmed quotes</h1>
        <p className="mt-1 text-sm text-muted">Newest confirmation first.</p>
      </div>
      <HistoryContent history={history} onRetry={retry} />
    </div>
  );
}

const PLACEHOLDER_CLASS =
  "rounded-xl border border-line bg-surface px-6 py-10 text-center text-sm text-muted";

function HistoryContent({ history, onRetry }: { history: HistoryState; onRetry: () => void }) {
  switch (history.status) {
    case "loading":
      return (
        <p role="status" className={PLACEHOLDER_CLASS}>
          Loading history…
        </p>
      );
    case "failed":
      return (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <p>
            {history.reason === "unreachable"
              ? "Couldn't reach the server. Please try again."
              : "Something went wrong. Please try again."}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-4 hover:text-foreground"
          >
            Retry
          </button>
        </div>
      );
    case "loaded":
      if (history.quotes.length === 0) {
        return <p className={PLACEHOLDER_CLASS}>No confirmed quotes yet.</p>;
      }
      return <HistoryTable quotes={history.quotes} />;
  }
}

function HistoryTable({ quotes }: { quotes: HistoryItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-2xl shadow-black/40">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Currency
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Quantity
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Unit price
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Total price
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Confirmed at
            </th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => (
            <tr
              key={quote.id}
              className="border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.02]"
            >
              <td className="px-4 py-3 font-medium">{quote.destinationCurrency}</td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {formatQuantity(quote.quantity)}
              </td>
              <td className="px-4 py-3 text-right font-mono tabular-nums">
                {formatUnitPrice(quote.unitPrice)}
              </td>
              <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                {formatBrl(quote.totalPrice)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatTimestamp(quote.confirmedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
