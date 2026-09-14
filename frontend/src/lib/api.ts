/**
 * The one place in the frontend that calls the backend. Types mirror
 * `backend/src/http/{login,currencies,quotes}.ts` field for field, and every amount is the integer
 * the backend stores, in the same unit. No function here throws: each resolves to an `ApiResult`.
 */

const DEFAULT_API_BASE_URL = "http://localhost:3001";

export interface LoginResponse {
  token: string;
  user: { username: string };
}

export interface Currency {
  code: string;
  name: string | null;
}

export interface CreateQuoteRequest {
  destinationCurrency: string;
  /** Integer destination-currency minor units: 100 MXN is `10000`. */
  quantity: number;
}

export interface QuoteResponse {
  id: number;
  destinationCurrency: string;
  /** Integer destination-currency minor units: 100 MXN is `10000`. */
  quantity: number;
  /** Integer BRL sub-units at 10^8 per destination-currency minor unit: R$0.00314375 is `314375`. */
  unitPrice: number;
  /** Integer BRL centavos: R$31.44 is `3144`. */
  totalPrice: number;
  /** ISO 8601 UTC. */
  createdAt: string;
  /** ISO 8601 UTC; the quote is still valid at exactly this instant. */
  expiresAt: string;
}

export interface ConfirmedQuoteResponse extends QuoteResponse {
  /** ISO 8601 UTC. */
  confirmedAt: string;
}

export interface HistoryItem {
  id: number;
  destinationCurrency: string;
  /** Integer destination-currency minor units. */
  quantity: number;
  /** Integer BRL sub-units at 10^8 per destination-currency minor unit. */
  unitPrice: number;
  /** Integer BRL centavos. */
  totalPrice: number;
  /** ISO 8601 UTC. */
  createdAt: string;
  /** ISO 8601 UTC. */
  confirmedAt: string;
}

/** Fields an error may carry next to `code` and `message`. */
export interface ApiErrorDetails {
  /** On `quantity_too_large`: the largest integer quantity that fits at the quoted rate. */
  maxQuantity?: number;
  [field: string]: unknown;
}

/** A non-2xx answer in the backend's shared `{ error: { code, message, ...details } }` shape. */
export interface ApiError {
  kind: "api_error";
  status: number;
  code: string;
  message: string;
  details: ApiErrorDetails;
}

/** The backend couldn't be reached, or answered with something other than the expected JSON. */
export interface NetworkError {
  kind: "network_error";
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError | NetworkError };

export function login(username: string): Promise<ApiResult<LoginResponse>> {
  return send("/api/login", { method: "POST", body: { username } }, (body) =>
    isLoginResponse(body) ? body : undefined,
  );
}

export function listCurrencies(): Promise<ApiResult<Currency[]>> {
  return send("/api/currencies", { method: "GET" }, (body) => {
    const currencies = isRecord(body) ? body.currencies : undefined;
    return Array.isArray(currencies) && currencies.every(isCurrency) ? currencies : undefined;
  });
}

export function createQuote(
  token: string,
  request: CreateQuoteRequest,
): Promise<ApiResult<QuoteResponse>> {
  const body = { destinationCurrency: request.destinationCurrency, quantity: request.quantity };
  return send("/api/quotes", { method: "POST", token, body }, (response) => {
    const quote = isRecord(response) ? response.quote : undefined;
    return isQuote(quote) ? quote : undefined;
  });
}

export function confirmQuote(
  token: string,
  id: number,
): Promise<ApiResult<ConfirmedQuoteResponse>> {
  return send(`/api/quotes/${id}/confirm`, { method: "POST", token }, (response) => {
    const quote = isRecord(response) ? response.quote : undefined;
    return isConfirmedQuote(quote) ? quote : undefined;
  });
}

export function listHistory(token: string): Promise<ApiResult<HistoryItem[]>> {
  return send("/api/quotes/history", { method: "GET", token }, (response) => {
    const quotes = isRecord(response) ? response.quotes : undefined;
    return Array.isArray(quotes) && quotes.every(isHistoryItem) ? quotes : undefined;
  });
}

/**
 * Written out in full so `next build` inlines it into the browser bundle. An empty value, as an
 * unset build arg gives, falls back to the default like an absent one.
 */
function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

interface Call {
  method: "GET" | "POST";
  token?: string;
  body?: object;
}

async function send<T>(
  path: string,
  call: Call,
  read: (body: unknown) => T | undefined,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method: call.method, headers };
  if (call.token !== undefined) {
    headers.Authorization = `Bearer ${call.token}`;
  }
  // Only together: Fastify answers a JSON content type with an empty body with 400 before the
  // route runs, which is why a bodyless POST such as confirm sends neither.
  if (call.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(call.body);
  }

  let response: Response;
  let body: unknown;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, init);
    body = await response.json();
  } catch {
    // Unreachable backend, or a body that isn't JSON at all (e.g. a proxy's HTML error page).
    return networkError();
  }

  if (!response.ok) {
    const error = readApiError(response.status, body);
    return error ? { ok: false, error } : networkError();
  }
  const data = read(body);
  return data === undefined ? networkError() : { ok: true, data };
}

function networkError(): { ok: false; error: NetworkError } {
  return { ok: false, error: { kind: "network_error" } };
}

function readApiError(status: number, body: unknown): ApiError | undefined {
  const error = isRecord(body) ? body.error : undefined;
  if (!isRecord(error)) {
    return undefined;
  }
  const { code, message, ...details } = error;
  if (typeof code !== "string" || typeof message !== "string") {
    return undefined;
  }
  if (code === "quantity_too_large" && !Number.isSafeInteger(details.maxQuantity)) {
    return undefined;
  }
  return { kind: "api_error", status, code, message, details };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (!isRecord(value) || typeof value.token !== "string") {
    return false;
  }
  const { user } = value;
  return isRecord(user) && typeof user.username === "string";
}

function isCurrency(value: unknown): value is Currency {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    (typeof value.name === "string" || value.name === null)
  );
}

/** The fields a quote and a history item share. */
function hasQuoteFields(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.destinationCurrency === "string" &&
    Number.isSafeInteger(value.quantity) &&
    Number.isSafeInteger(value.unitPrice) &&
    Number.isSafeInteger(value.totalPrice) &&
    typeof value.createdAt === "string"
  );
}

function isQuote(value: unknown): value is QuoteResponse {
  return hasQuoteFields(value) && typeof value.expiresAt === "string";
}

function isConfirmedQuote(value: unknown): value is ConfirmedQuoteResponse {
  return (
    hasQuoteFields(value) &&
    typeof value.expiresAt === "string" &&
    typeof value.confirmedAt === "string"
  );
}

function isHistoryItem(value: unknown): value is HistoryItem {
  return hasQuoteFields(value) && typeof value.confirmedAt === "string";
}
