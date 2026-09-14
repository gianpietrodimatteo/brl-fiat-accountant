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
      <h1 className="text-2xl font-semibold">Confirmed quotes</h1>
      <HistoryContent history={history} onRetry={retry} />
    </div>
  );
}

function HistoryContent({ history, onRetry }: { history: HistoryState; onRetry: () => void }) {
  switch (history.status) {
    case "loading":
      return (
        <p role="status" className="text-sm">
          Loading history…
        </p>
      );
    case "failed":
      return (
        <div role="alert" className="flex items-center gap-3 text-sm text-red-600">
          <p>
            {history.reason === "unreachable"
              ? "Couldn't reach the server. Please try again."
              : "Something went wrong. Please try again."}
          </p>
          <button type="button" onClick={onRetry} className="underline">
            Retry
          </button>
        </div>
      );
    case "loaded":
      if (history.quotes.length === 0) {
        return <p className="text-sm">No confirmed quotes yet.</p>;
      }
      return <HistoryTable quotes={history.quotes} />;
  }
}

function HistoryTable({ quotes }: { quotes: HistoryItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-foreground/20">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Currency
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Quantity
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Unit price
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Total price
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Confirmed at
            </th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => (
            <tr key={quote.id} className="border-b border-foreground/10">
              <td className="px-3 py-2">{quote.destinationCurrency}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatQuantity(quote.quantity)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatUnitPrice(quote.unitPrice)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatBrl(quote.totalPrice)}</td>
              <td className="px-3 py-2">{formatTimestamp(quote.confirmedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
