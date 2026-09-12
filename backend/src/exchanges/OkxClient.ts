import Decimal from "decimal.js";
import type { ExchangeClient, TopOfBook, TopOfBookResult } from "./ExchangeClient";

/** Minimal WebSocket surface this client needs, so tests can inject a fake socket. */
export interface WebSocketLike {
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "open" | "close" | "error", listener: () => void): void;
  send(data: string): void;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface OkxClientOptions {
  webSocketFactory?: WebSocketFactory;
  fetchFn?: typeof fetch;
  wsUrl?: string;
  restBaseUrl?: string;
  /** Timeout for a REST poll, and for a WebSocket that never finishes connecting. */
  timeoutMs?: number;
  /** How often socket health is re-checked; also the REST fallback polling interval. */
  monitorIntervalMs?: number;
  /** Silence on any inbound frame for this long triggers a keepalive `ping`. */
  pingAfterMs?: number;
  /** No frame within this long after a `ping` means the connection is dead. */
  pongTimeoutMs?: number;
  /** A last known price older than this is topped up over REST. */
  refreshAfterMs?: number;
  /** A last known price older than this is not usable for a quote. */
  maxPriceAgeMs?: number;
  /** First reconnect delay; doubles per failed attempt up to `maxReconnectDelayMs`. */
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

const DEFAULT_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";
const DEFAULT_REST_BASE_URL = "https://www.okx.com";
const DEFAULT_TIMEOUT_MS = 5000;
// Per [[business]]: while the price is stale, poll REST every 1 second.
const DEFAULT_MONITOR_INTERVAL_MS = 1000;
// OKX closes a connection that has been silent for 30s, and documents a `ping`/`pong`
// keepalive on a timer under that. 5s + 3s leaves a wide margin.
const DEFAULT_PING_AFTER_MS = 5000;
const DEFAULT_PONG_TIMEOUT_MS = 3000;
// Refresh well inside the quote's 10s validity, so a top-up lands before the price expires.
const DEFAULT_REFRESH_AFTER_MS = 5000;
// A quote is valid for 10 seconds, so a price older than that is never worth quoting from.
const DEFAULT_MAX_PRICE_AGE_MS = 10_000;
const DEFAULT_RECONNECT_DELAY_MS = 1000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
// OKX timestamps are authoritative for price age, but only while they look sane: a clock
// this far out is more likely our own skew (or a bogus payload) than a genuinely old price,
// and trusting it would silently disable the OKX leg.
const MAX_TIMESTAMP_SKEW_MS = 60_000;

// OKX is only ever used for the BRL leg, so this client serves exactly one instrument.
const BASE_ASSET = "USDT";
const QUOTE_ASSET = "BRL";
const INSTRUMENT_ID = `${BASE_ASSET}-${QUOTE_ASSET}`;
const TICKERS_CHANNEL = "tickers";
// OKX sends this shortly before closing a connection for a service upgrade.
const SERVICE_UPGRADE_NOTICE_CODE = "64008";
const PING_FRAME = "ping";
const PONG_FRAME = "pong";

interface TickerUpdate extends TopOfBook {
  /** OKX's own timestamp for the price, when the payload carried a usable one. */
  exchangeTs: number | null;
}

interface PriceSnapshot extends TopOfBook {
  /** When the price was true according to OKX, or when we received it as a fallback. */
  quotedAt: number;
}

/**
 * OKX USDT/BRL price source. A WebSocket feed keeps the last known top of book in memory;
 * `getTopOfBook` only ever reads that memory, so a quote request never waits on the socket.
 *
 * Connection liveness and price freshness are tracked separately, because the OKX tickers
 * channel only pushes on change: silence on a thin pair is normal, not a failure.
 * - Liveness drives reconnects, via OKX's `ping`/`pong` keepalive. Price silence never does.
 * - Freshness drives the REST fallback and the serve/refuse decision, measured from OKX's
 *   timestamp on the price.
 *
 * Network failures, timeouts and malformed payloads (WS or REST) surface as an "unavailable"
 * result, never as an exception.
 */
export class OkxClient implements ExchangeClient {
  private readonly webSocketFactory: WebSocketFactory;
  private readonly fetchFn: typeof fetch;
  private readonly wsUrl: string;
  private readonly restBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly monitorIntervalMs: number;
  private readonly pingAfterMs: number;
  private readonly pongTimeoutMs: number;
  private readonly refreshAfterMs: number;
  private readonly maxPriceAgeMs: number;
  private readonly baseReconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;

  private socket: WebSocketLike | null = null;
  private socketOpen = false;
  private socketCreatedAt = 0;
  private lastFrameAt = 0;
  private pingSentAt: number | null = null;
  private reconnectDelayMs: number;
  private nextConnectAt = 0;
  private snapshot: PriceSnapshot | null = null;
  private monitor: ReturnType<typeof setInterval> | null = null;
  private restPolling = false;
  private restInFlight = false;

  constructor(options: OkxClientOptions = {}) {
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url));
    this.fetchFn = options.fetchFn ?? fetch;
    this.wsUrl = options.wsUrl ?? DEFAULT_WS_URL;
    this.restBaseUrl = options.restBaseUrl ?? DEFAULT_REST_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.monitorIntervalMs = options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS;
    this.pingAfterMs = options.pingAfterMs ?? DEFAULT_PING_AFTER_MS;
    this.pongTimeoutMs = options.pongTimeoutMs ?? DEFAULT_PONG_TIMEOUT_MS;
    this.refreshAfterMs = options.refreshAfterMs ?? DEFAULT_REFRESH_AFTER_MS;
    this.maxPriceAgeMs = options.maxPriceAgeMs ?? DEFAULT_MAX_PRICE_AGE_MS;
    this.baseReconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    this.reconnectDelayMs = this.baseReconnectDelayMs;
  }

  /**
   * Opens the feed and starts health monitoring. Idempotent and non-blocking. Reconnects
   * are driven only by the health check, so a burst of price lookups can't turn into a
   * burst of connection attempts.
   */
  start(): void {
    if (this.monitor !== null) {
      return;
    }

    this.monitor = setInterval(() => {
      this.checkHealth();
    }, this.monitorIntervalMs);
    // Never hold the process open just for the price feed.
    this.monitor.unref?.();
    this.openSocket();
  }

  /** Closes the feed and stops all timers. */
  stop(): void {
    if (this.monitor !== null) {
      clearInterval(this.monitor);
      this.monitor = null;
    }
    this.discardSocket();
    this.restPolling = false;
    this.reconnectDelayMs = this.baseReconnectDelayMs;
    this.nextConnectAt = 0;
  }

  /** True while the REST fallback is topping up a price the socket isn't refreshing. */
  isRestPolling(): boolean {
    return this.restPolling;
  }

  /** Resolves immediately from in-memory state — it never waits on the socket or on REST. */
  async getTopOfBook(baseAsset: string, quoteAsset: string): Promise<TopOfBookResult> {
    if (baseAsset !== BASE_ASSET || quoteAsset !== QUOTE_ASSET) {
      return {
        status: "unavailable",
        reason: `OKX client only serves ${BASE_ASSET}/${QUOTE_ASSET}, not ${baseAsset}/${quoteAsset}`,
      };
    }

    this.start();

    const snapshot = this.snapshot;
    if (snapshot === null) {
      return { status: "unavailable", reason: `No OKX ${INSTRUMENT_ID} price received yet` };
    }

    const age = this.priceAge();
    if (age > this.maxPriceAgeMs) {
      return {
        status: "unavailable",
        reason: `Last known OKX ${INSTRUMENT_ID} price is ${age}ms old`,
      };
    }

    return { status: "available", bid: snapshot.bid, ask: snapshot.ask };
  }

  private checkHealth(): void {
    this.checkLiveness();
    this.refreshPriceIfStale();
  }

  /**
   * Keeps the connection alive and replaces it when it stops answering. Deliberately blind
   * to whether prices are arriving: a live connection on a quiet market is healthy.
   */
  private checkLiveness(): void {
    if (this.socket !== null) {
      this.auditSocket(this.socket);
    }
    if (this.socket === null) {
      this.connectIfDue();
    }
  }

  private auditSocket(socket: WebSocketLike): void {
    const now = Date.now();

    if (!this.socketOpen) {
      if (now - this.socketCreatedAt > this.timeoutMs) {
        // A connect that overran its budget is dead; replace it.
        this.discardSocket();
      }
      return;
    }

    if (this.pingSentAt !== null) {
      if (now - this.pingSentAt > this.pongTimeoutMs) {
        // No frame at all since our ping: the connection is gone even though it still looks
        // open, which is exactly the silent death a proxy or NAT timeout produces.
        this.discardSocket();
      }
      return;
    }

    if (now - this.lastFrameAt > this.pingAfterMs) {
      this.sendPing(socket);
    }
  }

  private sendPing(socket: WebSocketLike): void {
    // Recorded before sending so that a pong arriving inside `send` still clears it.
    this.pingSentAt = Date.now();
    try {
      // OKX's keepalive is a literal "ping" string, not a JSON payload.
      socket.send(PING_FRAME);
    } catch {
      this.discardSocket();
    }
  }

  private connectIfDue(): void {
    if (Date.now() < this.nextConnectAt) {
      return;
    }
    this.openSocket();
  }

  private openSocket(): void {
    if (this.socket !== null) {
      return;
    }

    // Back off before the next attempt, so an outage can't become a connection storm. Reset
    // once the connection proves itself by delivering a frame.
    this.nextConnectAt = Date.now() + this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);

    let socket: WebSocketLike;
    try {
      socket = this.webSocketFactory(this.wsUrl);
    } catch {
      // A factory that throws (bad URL, exhausted sockets) leaves us with no socket; the
      // next health check retries while REST polling serves prices.
      return;
    }

    this.socket = socket;
    this.socketOpen = false;
    this.socketCreatedAt = Date.now();
    this.pingSentAt = null;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socketOpen = true;
      // Start the keepalive clock from the handshake, not from the last price.
      this.lastFrameAt = Date.now();
      this.subscribe(socket);
    });
    socket.addEventListener("message", (event) => {
      if (this.socket === socket) {
        this.handleFrame(event.data);
      }
    });
    socket.addEventListener("close", () => {
      this.handleSocketGone(socket);
    });
    socket.addEventListener("error", () => {
      this.handleSocketGone(socket);
    });
  }

  private subscribe(socket: WebSocketLike): void {
    try {
      socket.send(
        JSON.stringify({
          op: "subscribe",
          args: [{ channel: TICKERS_CHANNEL, instId: INSTRUMENT_ID }],
        }),
      );
    } catch {
      // The send failed, so no updates will arrive: drop the socket and let the health
      // check reconnect.
      this.handleSocketGone(socket);
    }
  }

  private handleSocketGone(socket: WebSocketLike): void {
    if (this.socket !== socket) {
      return;
    }
    this.socket = null;
    this.socketOpen = false;
    this.pingSentAt = null;
  }

  private discardSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    this.pingSentAt = null;
    if (socket === null) {
      return;
    }
    try {
      socket.close();
    } catch {
      // Closing a socket that is already gone is not a failure worth propagating.
    }
  }

  /** Any inbound frame proves the connection is alive, whether or not it carries a price. */
  private handleFrame(data: unknown): void {
    this.lastFrameAt = Date.now();
    this.pingSentAt = null;
    // This connection reached us, so the backoff earned by earlier failures is spent: the
    // next reconnect starts from scratch and needn't wait.
    this.reconnectDelayMs = this.baseReconnectDelayMs;
    this.nextConnectAt = 0;

    const text = typeof data === "string" ? data : null;
    if (text === PONG_FRAME) {
      return;
    }

    const payload = parseFrame(text ?? data);
    if (payload === null) {
      // Malformed frames still counted as liveness above, but carry nothing else.
      return;
    }

    if (isServiceUpgradeNotice(payload)) {
      // OKX is about to close this connection. Reconnect now rather than taking the gap
      // when they hang up; the REST fallback covers the handover.
      this.discardSocket();
      this.connectIfDue();
      return;
    }

    const update = parseTickerFrame(payload);
    if (update !== null) {
      this.store(update);
    }
  }

  /** Tops the price up over REST while the socket isn't delivering fresh ones. */
  private refreshPriceIfStale(): void {
    // A disconnected socket polls even with a fresh price in hand, per [[business]]: the next
    // update isn't coming over the socket. A connected-but-quiet one polls only once its
    // price ages, which is what keeps a thin market from looking like an outage.
    if (this.socketOpen && this.priceAge() <= this.refreshAfterMs) {
      this.restPolling = false;
      return;
    }

    this.restPolling = true;
    void this.pollRest();
  }

  private priceAge(): number {
    if (this.snapshot === null) {
      return Number.POSITIVE_INFINITY;
    }
    return Date.now() - this.snapshot.quotedAt;
  }

  private async pollRest(): Promise<void> {
    if (this.restInFlight) {
      return;
    }

    this.restInFlight = true;
    try {
      const update = await this.fetchTicker();
      if (update !== null) {
        this.store(update);
      }
    } finally {
      this.restInFlight = false;
    }
  }

  private async fetchTicker(): Promise<TickerUpdate | null> {
    try {
      const url = `${this.restBaseUrl}/api/v5/market/ticker?instId=${encodeURIComponent(INSTRUMENT_ID)}`;
      const response = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) {
        return null;
      }

      const data: unknown = await response.json();
      return parseRestTicker(data);
    } catch {
      // Network failure or timeout: the last known price stays in memory and ages out on
      // its own if the outage lasts.
      return null;
    }
  }

  private store(update: TickerUpdate): void {
    const now = Date.now();
    const exchangeTs = update.exchangeTs;
    // OKX's timestamp is the authoritative age of the price; local receive time is only a
    // fallback for a payload without a usable one.
    const quotedAt =
      exchangeTs !== null && Math.abs(now - exchangeTs) <= MAX_TIMESTAMP_SKEW_MS ? exchangeTs : now;
    this.snapshot = { bid: update.bid, ask: update.ask, quotedAt };
  }
}

function parseFrame(data: unknown): Record<string, unknown> | null {
  let payload: unknown;
  try {
    payload = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return null;
  }

  return isRecord(payload) ? payload : null;
}

function isServiceUpgradeNotice(payload: Record<string, unknown>): boolean {
  return payload.event === "notice" && payload.code === SERVICE_UPGRADE_NOTICE_CODE;
}

function parseTickerFrame(payload: Record<string, unknown>): TickerUpdate | null {
  if (!isRecord(payload.arg) || payload.arg.channel !== TICKERS_CHANNEL) {
    return null;
  }
  if (payload.arg.instId !== INSTRUMENT_ID || !Array.isArray(payload.data)) {
    return null;
  }

  return parseTickerEntry(payload.data[0]);
}

function parseRestTicker(data: unknown): TickerUpdate | null {
  if (!isRecord(data) || data.code !== "0" || !Array.isArray(data.data)) {
    return null;
  }

  const entry: unknown = data.data[0];
  if (isRecord(entry) && entry.instId !== INSTRUMENT_ID) {
    return null;
  }

  return parseTickerEntry(entry);
}

function parseTickerEntry(entry: unknown): TickerUpdate | null {
  if (!isRecord(entry) || typeof entry.bidPx !== "string" || typeof entry.askPx !== "string") {
    return null;
  }

  try {
    const bid = new Decimal(entry.bidPx);
    const ask = new Decimal(entry.askPx);
    if (!bid.isFinite() || !ask.isFinite() || bid.isNegative() || ask.isNegative()) {
      return null;
    }
    return { bid, ask, exchangeTs: parseTimestamp(entry.ts) };
  } catch {
    return null;
  }
}

function parseTimestamp(ts: unknown): number | null {
  if (typeof ts !== "string") {
    return null;
  }
  const parsed = Number(ts);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
