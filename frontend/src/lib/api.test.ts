import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { confirmQuote, createQuote, listCurrencies, listHistory, login } from "./api";

const BASE_URL = "http://api.test";
const TOKEN = "0b8e6a52-3c1f-4f7e-9d2a-6f1b2c3d4e5f";

const quote = {
  id: 42,
  destinationCurrency: "MXN",
  quantity: 10000,
  unitPrice: 314375,
  totalPrice: 3144,
  createdAt: "2026-09-14T12:00:00.000Z",
  expiresAt: "2026-09-14T12:00:10.000Z",
};
const confirmedQuote = { ...quote, confirmedAt: "2026-09-14T12:00:05.000Z" };
const historyItem = {
  id: 42,
  destinationCurrency: "MXN",
  quantity: 10000,
  unitPrice: 314375,
  totalPrice: 3144,
  createdAt: "2026-09-14T12:00:00.000Z",
  confirmedAt: "2026-09-14T12:00:05.000Z",
};

let fetchMock: Mock<typeof fetch>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", BASE_URL);
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The one request the call under test sent. */
function sentRequest() {
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0];
  return {
    url: String(url),
    method: init?.method,
    headers: new Headers(init?.headers),
    body: init?.body,
  };
}

describe("requests", () => {
  it("confirmQuote sends a bearer POST with no body and no Content-Type", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { quote: confirmedQuote }));

    const result = await confirmQuote(TOKEN, 42);

    const sent = sentRequest();
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe(`${BASE_URL}/api/quotes/42/confirm`);
    expect(sent.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(sent.body).toBeUndefined();
    expect(sent.headers.has("Content-Type")).toBe(false);
    expect(result).toEqual({ ok: true, data: confirmedQuote });
  });

  it("createQuote sends a bearer POST with a JSON body", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { quote }));

    const result = await createQuote(TOKEN, { destinationCurrency: "MXN", quantity: 10000 });

    const sent = sentRequest();
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe(`${BASE_URL}/api/quotes`);
    expect(sent.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(sent.headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(sent.body))).toEqual({ destinationCurrency: "MXN", quantity: 10000 });
    expect(result).toEqual({ ok: true, data: quote });
  });

  it("login sends a JSON POST without Authorization", async () => {
    const session = { token: TOKEN, user: { username: "alice" } };
    fetchMock.mockResolvedValue(jsonResponse(200, session));

    const result = await login("alice");

    const sent = sentRequest();
    expect(sent.method).toBe("POST");
    expect(sent.url).toBe(`${BASE_URL}/api/login`);
    expect(sent.headers.get("Content-Type")).toBe("application/json");
    expect(sent.headers.has("Authorization")).toBe(false);
    expect(JSON.parse(String(sent.body))).toEqual({ username: "alice" });
    expect(result).toEqual({ ok: true, data: session });
  });

  it("listCurrencies sends a GET with no Authorization and returns the list", async () => {
    const currencies = [
      { code: "EUR", name: "Euro" },
      { code: "MXN", name: null },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { currencies }));

    const result = await listCurrencies();

    const sent = sentRequest();
    expect(sent.method).toBe("GET");
    expect(sent.url).toBe(`${BASE_URL}/api/currencies`);
    expect(sent.headers.has("Authorization")).toBe(false);
    expect(sent.headers.has("Content-Type")).toBe(false);
    expect(sent.body).toBeUndefined();
    expect(result).toEqual({ ok: true, data: currencies });
  });

  it("listHistory sends a bearer GET and returns the items", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { quotes: [historyItem] }));

    const result = await listHistory(TOKEN);

    const sent = sentRequest();
    expect(sent.method).toBe("GET");
    expect(sent.url).toBe(`${BASE_URL}/api/quotes/history`);
    expect(sent.headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(sent.headers.has("Content-Type")).toBe(false);
    expect(result).toEqual({ ok: true, data: [historyItem] });
  });
});

describe("base URL", () => {
  it("defaults to http://localhost:3001", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined);
    fetchMock.mockResolvedValue(jsonResponse(200, { currencies: [] }));

    await listCurrencies();

    expect(sentRequest().url).toBe("http://localhost:3001/api/currencies");
  });

  it("treats an empty value as unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    fetchMock.mockResolvedValue(jsonResponse(200, { currencies: [] }));

    await listCurrencies();

    expect(sentRequest().url).toBe("http://localhost:3001/api/currencies");
  });

  it("ignores a trailing slash", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://api.test/");
    fetchMock.mockResolvedValue(jsonResponse(200, { currencies: [] }));

    await listCurrencies();

    expect(sentRequest().url).toBe(`${BASE_URL}/api/currencies`);
  });
});

describe("API errors", () => {
  it("reads a 410 quote_expired", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(410, { error: { code: "quote_expired", message: "The quote has expired" } }),
    );

    const result = await confirmQuote(TOKEN, 42);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "api_error",
        status: 410,
        code: "quote_expired",
        message: "The quote has expired",
        details: {},
      },
    });
  });

  it("exposes maxQuantity on a 422 quantity_too_large", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: "quantity_too_large",
          message: "quantity is too large to quote",
          maxQuantity: 2865064017862,
        },
      }),
    );

    const result = await createQuote(TOKEN, { destinationCurrency: "MXN", quantity: 10 ** 15 });

    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== "api_error") {
      throw new Error("expected an api_error");
    }
    expect(result.error.status).toBe(422);
    expect(result.error.code).toBe("quantity_too_large");
    expect(result.error.details.maxQuantity).toBe(2865064017862);
    expect(Number.isInteger(result.error.details.maxQuantity)).toBe(true);
  });

  it("reads a 401 unauthorized", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        error: { code: "unauthorized", message: "A valid bearer token is required" },
      }),
    );

    const result = await listHistory("stale-token");

    expect(result).toMatchObject({
      ok: false,
      error: { kind: "api_error", status: 401, code: "unauthorized" },
    });
  });
});

describe("network errors", () => {
  const networkError = { ok: false, error: { kind: "network_error" } };

  it("turns a rejected fetch into network_error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(confirmQuote(TOKEN, 42)).resolves.toEqual(networkError);
  });

  it("turns a 200 with a non-JSON body into network_error", async () => {
    fetchMock.mockResolvedValue(new Response("<html>ok</html>", { status: 200 }));

    await expect(listCurrencies()).resolves.toEqual(networkError);
  });

  it("turns a 200 with JSON of the wrong shape into network_error", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { quote: { ...quote, totalPrice: "31.44" } }));

    await expect(confirmQuote(TOKEN, 42)).resolves.toEqual(networkError);
  });

  it("turns an error status without the shared error shape into network_error", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(listHistory(TOKEN)).resolves.toEqual(networkError);
  });

  it("turns a quantity_too_large without an integer maxQuantity into network_error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: { code: "quantity_too_large", message: "too large", maxQuantity: 1.5 },
      }),
    );

    await expect(
      createQuote(TOKEN, { destinationCurrency: "MXN", quantity: 10000 }),
    ).resolves.toEqual(networkError);
  });
});
