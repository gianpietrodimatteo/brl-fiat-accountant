import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmQuote,
  createQuote,
  listCurrencies,
  type ApiResult,
  type ConfirmedQuoteResponse,
  type QuoteResponse,
} from "@/lib/api";
import { formatTimestamp } from "@/lib/amounts";
import { SESSION_STORAGE_KEY, SessionProvider } from "@/lib/session";
import QuotationPage from "./page";

vi.mock("@/lib/api", () => ({
  listCurrencies: vi.fn(),
  createQuote: vi.fn(),
  confirmQuote: vi.fn(),
}));

const TOKEN = "0b8e6a52-3c1f-4f7e-9d2a-6f1b2c3d4e5f";
const networkError = { ok: false, error: { kind: "network_error" } } as const;

const CURRENCIES = [
  { code: "EUR", name: "Euro" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "COP", name: "Colombian Peso" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "ZAR", name: null },
];

const QUOTE: QuoteResponse = {
  id: 42,
  destinationCurrency: "MXN",
  quantity: 10000,
  unitPrice: 314375,
  totalPrice: 3144,
  createdAt: "2026-09-14T12:00:00.000Z",
  expiresAt: "2026-09-14T12:00:10.000Z",
};

const CONFIRMED: ConfirmedQuoteResponse = { ...QUOTE, confirmedAt: "2026-09-14T12:00:05.000Z" };

function apiError(status: number, code: string, details: Record<string, unknown> = {}) {
  return {
    ok: false,
    error: { kind: "api_error", status, code, message: code, details },
  } as const;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token: TOKEN, username: "bob" }));
  vi.mocked(listCurrencies).mockResolvedValue({ ok: true, data: CURRENCIES });
  vi.mocked(createQuote).mockResolvedValue({ ok: true, data: QUOTE });
  vi.mocked(confirmQuote).mockResolvedValue({ ok: true, data: CONFIRMED });
});

async function renderQuotation() {
  render(
    <SessionProvider>
      <QuotationPage />
    </SessionProvider>,
  );
  const select = () => screen.getByRole("combobox", { name: "Currency" });
  const quantity = () => screen.getByRole("textbox", { name: "Quantity" });
  const create = () => screen.getByRole("button", { name: "Create quote" });
  const confirm = () => screen.queryByRole("button", { name: "Confirm" });
  const card = () => screen.queryByRole("region", { name: "Quote" });

  async function fill(code: string, text: string) {
    await screen.findByRole("option", { name: new RegExp(`^${code}`) });
    await userEvent.selectOptions(select(), code);
    await userEvent.clear(quantity());
    if (text !== "") {
      await userEvent.type(quantity(), text);
    }
  }

  async function createMxnQuote() {
    await fill("MXN", "100");
    await userEvent.click(create());
    await screen.findByRole("region", { name: "Quote" });
  }

  return { select, quantity, create, confirm, card, fill, createMxnQuote };
}

describe("QuotationPage currencies", () => {
  it("lists exactly the currencies listCurrencies returns, with the name when there is one", async () => {
    const { select } = await renderQuotation();

    await screen.findByRole("option", { name: "EUR — Euro" });
    const options = within(select()).getAllByRole("option").slice(1);
    expect(options.map((option) => option.textContent)).toEqual([
      "EUR — Euro",
      "ARS — Argentine Peso",
      "COP — Colombian Peso",
      "MXN — Mexican Peso",
      "ZAR",
    ]);
    expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual([
      "EUR",
      "ARS",
      "COP",
      "MXN",
      "ZAR",
    ]);
  });

  it("renders a different set when the response has one", async () => {
    vi.mocked(listCurrencies).mockResolvedValue({
      ok: true,
      data: [
        { code: "JPY", name: "Yen" },
        { code: "MXN", name: null },
      ],
    });
    const { select } = await renderQuotation();

    await screen.findByRole("option", { name: "JPY — Yen" });
    const options = within(select()).getAllByRole("option").slice(1);
    expect(options.map((option) => option.textContent)).toEqual(["JPY — Yen", "MXN"]);
  });

  it("shows a retryable message when listCurrencies fails, then loads on retry", async () => {
    vi.mocked(listCurrencies).mockResolvedValueOnce(networkError);
    const { select } = await renderQuotation();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load the currencies/i);
    expect(select()).toBeDisabled();

    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await screen.findByRole("option", { name: "MXN — Mexican Peso" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(select()).toBeEnabled();
    expect(listCurrencies).toHaveBeenCalledTimes(2);
  });
});

describe("QuotationPage create", () => {
  it("sends MXN and 100 as 10000 minor units with the session token", async () => {
    const { fill, create } = await renderQuotation();

    await fill("MXN", "100");
    await userEvent.click(create());

    expect(createQuote).toHaveBeenCalledWith(TOKEN, {
      destinationCurrency: "MXN",
      quantity: 10000,
    });
  });

  it("sends 100.50 as 10050", async () => {
    const { fill, create } = await renderQuotation();

    await fill("MXN", "100.50");
    await userEvent.click(create());

    expect(createQuote).toHaveBeenCalledWith(TOKEN, {
      destinationCurrency: "MXN",
      quantity: 10050,
    });
  });

  it.each([
    ["empty", ""],
    ["non-numeric", "abc"],
    ["zero", "0"],
    ["negative", "-5"],
    ["3-decimal", "1.005"],
  ])("disables Create for a %s quantity", async (_, text) => {
    const { fill, create } = await renderQuotation();

    await fill("MXN", text);

    expect(create()).toBeDisabled();
  });

  it("disables Create with no currency selected", async () => {
    const { quantity, create } = await renderQuotation();

    await screen.findByRole("option", { name: "MXN — Mexican Peso" });
    await userEvent.type(quantity(), "100");

    expect(create()).toBeDisabled();
  });

  it("sends one request on a double click and re-enables Create when it answers", async () => {
    let answer!: (value: ApiResult<QuoteResponse>) => void;
    vi.mocked(createQuote).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { fill, create } = await renderQuotation();

    await fill("MXN", "100");
    await userEvent.dblClick(create());

    expect(createQuote).toHaveBeenCalledOnce();
    expect(create()).toBeDisabled();

    await act(async () => answer(networkError));
    expect(create()).toBeEnabled();
  });

  it("shows the backend's amounts formatted, the expiry time and a Confirm button", async () => {
    const { card, confirm, createMxnQuote } = await renderQuotation();

    await createMxnQuote();

    const quote = card()!;
    expect(quote).toHaveTextContent("MXN");
    expect(quote).toHaveTextContent("100.00");
    expect(quote).toHaveTextContent("R$ 0.314375");
    expect(quote).toHaveTextContent("R$ 31.44");
    expect(quote).toHaveTextContent(formatTimestamp(QUOTE.expiresAt));
    expect(confirm()).toBeEnabled();
  });

  it.each([
    [
      "400 invalid_quantity",
      apiError(400, "invalid_quantity"),
      /greater than zero, with at most 2 decimals/i,
    ],
    ["400 unsupported_currency", apiError(400, "unsupported_currency"), /isn't supported/i],
    [
      "422 quantity_too_large",
      apiError(422, "quantity_too_large", { maxQuantity: 12345 }),
      /too large\. the largest you can quote is 123\.45 MXN/i,
    ],
    ["503 no_quote_capability", apiError(503, "no_quote_capability"), /temporarily unavailable/i],
    ["network_error", networkError, /couldn't reach the server/i],
    ["an unexpected error", apiError(500, "internal_error"), /something went wrong/i],
  ])("shows its own message and no quote card on %s", async (_, failure, message) => {
    vi.mocked(createQuote).mockResolvedValue(failure);
    const { fill, create, card, confirm } = await renderQuotation();

    await fill("MXN", "100");
    await userEvent.click(create());

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(card()).not.toBeInTheDocument();
    expect(confirm()).not.toBeInTheDocument();
    expect(create()).toBeEnabled();
  });

  it("replaces the quote on screen, and its confirm message, with a new one", async () => {
    vi.mocked(confirmQuote).mockResolvedValue(apiError(410, "quote_expired"));
    const { create, card, confirm, createMxnQuote } = await renderQuotation();
    await createMxnQuote();
    await userEvent.click(confirm()!);
    await screen.findByText(/this quote has expired/i);

    vi.mocked(createQuote).mockResolvedValue({
      ok: true,
      data: { ...QUOTE, id: 43, totalPrice: 3200 },
    });
    await userEvent.click(create());

    await screen.findByText("R$ 32.00");
    expect(screen.queryByText(/this quote has expired/i)).not.toBeInTheDocument();
    expect(card()).not.toHaveTextContent("R$ 31.44");
    expect(confirm()).toBeEnabled();

    await userEvent.click(confirm()!);
    expect(confirmQuote).toHaveBeenLastCalledWith(TOKEN, 43);
  });
});

describe("QuotationPage confirm", () => {
  it("confirms the quote's id and shows a confirmed message without Confirm", async () => {
    const { confirm, createMxnQuote } = await renderQuotation();
    await createMxnQuote();

    await userEvent.click(confirm()!);

    expect(confirmQuote).toHaveBeenCalledWith(TOKEN, QUOTE.id);
    expect(await screen.findByRole("status")).toHaveTextContent(
      `Quote confirmed at ${formatTimestamp(CONFIRMED.confirmedAt)}`,
    );
    expect(confirm()).not.toBeInTheDocument();
  });

  it("shows the expired message on 410, removes Confirm and keeps the form usable", async () => {
    vi.mocked(confirmQuote).mockResolvedValue(apiError(410, "quote_expired"));
    const { confirm, create, createMxnQuote } = await renderQuotation();
    await createMxnQuote();

    await userEvent.click(confirm()!);

    expect(await screen.findByRole("alert")).toHaveTextContent(/this quote has expired/i);
    expect(confirm()).not.toBeInTheDocument();
    expect(create()).toBeEnabled();

    await userEvent.click(create());
    expect(createQuote).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["409 quote_already_confirmed", apiError(409, "quote_already_confirmed"), /already confirmed/i],
    ["404 quote_not_found", apiError(404, "quote_not_found"), /could not be found/i],
  ])("shows its own message on %s and removes Confirm", async (_, failure, message) => {
    vi.mocked(confirmQuote).mockResolvedValue(failure);
    const { confirm, createMxnQuote } = await renderQuotation();
    await createMxnQuote();

    await userEvent.click(confirm()!);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(confirm()).not.toBeInTheDocument();
  });

  it.each([
    ["network_error", networkError, /couldn't reach the server/i],
    ["an unexpected error", apiError(500, "internal_error"), /something went wrong/i],
  ])("keeps Confirm for a retry on %s", async (_, failure, message) => {
    vi.mocked(confirmQuote).mockResolvedValueOnce(failure);
    const { confirm, createMxnQuote } = await renderQuotation();
    await createMxnQuote();

    await userEvent.click(confirm()!);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(confirm()).toBeEnabled();

    await userEvent.click(confirm()!);
    expect(await screen.findByRole("status")).toHaveTextContent(/quote confirmed/i);
    expect(confirmQuote).toHaveBeenCalledTimes(2);
  });

  it("disables Confirm and Create while confirming, so a double click sends one request", async () => {
    let answer!: (value: ApiResult<ConfirmedQuoteResponse>) => void;
    vi.mocked(confirmQuote).mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { confirm, create, createMxnQuote } = await renderQuotation();
    await createMxnQuote();

    await userEvent.dblClick(confirm()!);

    expect(confirmQuote).toHaveBeenCalledOnce();
    expect(confirm()).toBeDisabled();
    expect(create()).toBeDisabled();

    await act(async () => answer(networkError));
    expect(confirm()).toBeEnabled();
    expect(create()).toBeEnabled();
  });

  it("keeps Confirm enabled for a quote whose expiresAt is long past: only the backend decides", async () => {
    vi.mocked(createQuote).mockResolvedValue({
      ok: true,
      data: {
        ...QUOTE,
        createdAt: "2000-01-01T00:00:00.000Z",
        expiresAt: "2000-01-01T00:00:10.000Z",
      },
    });
    const { confirm, createMxnQuote } = await renderQuotation();
    await createMxnQuote();

    expect(confirm()).toBeEnabled();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();

    await userEvent.click(confirm()!);
    expect(confirmQuote).toHaveBeenCalledWith(TOKEN, QUOTE.id);
  });
});
