import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedShell } from "@/components/authenticated-shell";
import { listHistory, type ApiResult, type HistoryItem } from "@/lib/api";
import { formatTimestamp } from "@/lib/amounts";
import { SESSION_STORAGE_KEY, SessionProvider } from "@/lib/session";
import HistoryPage from "./page";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/history" }));
vi.mock("@/lib/api", () => ({ listHistory: vi.fn() }));

const TOKEN = "0b8e6a52-3c1f-4f7e-9d2a-6f1b2c3d4e5f";
const networkError = { ok: false, error: { kind: "network_error" } } as const;

function apiError(status: number, code: string) {
  return {
    ok: false,
    error: { kind: "api_error", status, code, message: code, details: {} },
  } as const;
}

const NEWER: HistoryItem = {
  id: 7,
  destinationCurrency: "MXN",
  quantity: 10000,
  unitPrice: 314375,
  totalPrice: 3144,
  createdAt: "2026-09-13T08:00:00.000Z",
  confirmedAt: "2026-09-14T15:30:05.000Z",
};

const OLDER: HistoryItem = {
  id: 9,
  destinationCurrency: "EUR",
  quantity: 5050,
  unitPrice: 588510000,
  totalPrice: 297198,
  createdAt: "2026-09-12T10:00:00.000Z",
  confirmedAt: "2026-09-12T10:00:04.000Z",
};

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: TOKEN, username: "bob" }));
  vi.mocked(listHistory).mockResolvedValue({ ok: true, data: [NEWER, OLDER] });
});

function renderHistory() {
  return render(
    <SessionProvider>
      <HistoryPage />
    </SessionProvider>,
  );
}

/** The body rows, without the header row. */
function bodyRows() {
  return screen.queryAllByRole("row").filter((row) => within(row).queryAllByRole("cell").length);
}

function cellTexts(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

describe("HistoryPage", () => {
  it("loads the history once with the session token", async () => {
    renderHistory();

    await screen.findByRole("table");
    expect(listHistory).toHaveBeenCalledOnce();
    expect(listHistory).toHaveBeenCalledWith(TOKEN);
  });

  it("shows a loading state while the request is pending", async () => {
    let answer!: (value: ApiResult<HistoryItem[]>) => void;
    vi.mocked(listHistory).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderHistory();

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await act(async () => answer({ ok: true, data: [NEWER] }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(1);
  });

  it("renders one row per quote, in the order the API returns them, with every column", async () => {
    renderHistory();

    await screen.findByRole("table");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Currency",
      "Quantity",
      "Unit price",
      "Total price",
      "Confirmed at",
    ]);
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    expect(cellTexts(rows[0])).toEqual([
      "MXN",
      "100.00",
      "R$ 0.314375",
      "R$ 31.44",
      formatTimestamp(NEWER.confirmedAt),
    ]);
    expect(cellTexts(rows[1])).toEqual([
      "EUR",
      "50.50",
      "R$ 588.51",
      "R$ 2971.98",
      formatTimestamp(OLDER.confirmedAt),
    ]);
  });

  it("keeps the API's order even when it isn't the order of the ids or dates", async () => {
    vi.mocked(listHistory).mockResolvedValue({ ok: true, data: [OLDER, NEWER] });
    renderHistory();

    await screen.findByRole("table");
    expect(bodyRows().map((row) => cellTexts(row)[0])).toEqual(["EUR", "MXN"]);
  });

  it("shows confirmedAt, not createdAt, as the date/time", async () => {
    vi.mocked(listHistory).mockResolvedValue({ ok: true, data: [NEWER] });
    renderHistory();

    await screen.findByRole("table");
    const [row] = bodyRows();
    expect(row).toHaveTextContent(formatTimestamp(NEWER.confirmedAt));
    expect(row).not.toHaveTextContent(formatTimestamp(NEWER.createdAt));
  });

  it("shows the no-confirmed-quotes message and no table for an empty list", async () => {
    vi.mocked(listHistory).mockResolvedValue({ ok: true, data: [] });
    renderHistory();

    expect(await screen.findByText(/no confirmed quotes yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("row")).toHaveLength(0);
  });

  it.each([
    ["network_error", networkError, /couldn't reach the server/i],
    ["an unexpected error", apiError(500, "internal_error"), /something went wrong/i],
  ])(
    "shows a message with a retry on %s, and renders the rows on success",
    async (_, failure, message) => {
      vi.mocked(listHistory).mockResolvedValueOnce(failure);
      renderHistory();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();

      await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

      await screen.findByRole("table");
      expect(bodyRows()).toHaveLength(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(listHistory).toHaveBeenCalledTimes(2);
      expect(listHistory).toHaveBeenLastCalledWith(TOKEN);
    },
  );

  it("has no filter, pagination, sort control or total", async () => {
    renderHistory();

    await screen.findByRole("table");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    screen.getAllByRole("columnheader").forEach((header) => {
      expect(header).not.toHaveAttribute("aria-sort");
    });
    // Only the two quotes' own totals are on screen: no footer row, no sum (R$ 3003.42).
    expect(screen.queryAllByRole("row")).toHaveLength(3);
    expect(screen.queryAllByText(/^R\$ \d+\.\d{2}$/).map((cell) => cell.textContent)).toEqual([
      "R$ 31.44",
      "R$ 588.51",
      "R$ 2971.98",
    ]);
    expect(document.body).not.toHaveTextContent("3003.42");
  });

  it("goes through the shared 401 handling: the session is cleared and the shell redirects to /login", async () => {
    vi.mocked(listHistory).mockResolvedValue(apiError(401, "unauthorized"));
    const { container } = render(
      <SessionProvider>
        <AuthenticatedShell>
          <HistoryPage />
        </AuthenticatedShell>
      </SessionProvider>,
    );

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(listHistory).toHaveBeenCalledWith(TOKEN);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
