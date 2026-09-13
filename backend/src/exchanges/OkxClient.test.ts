import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OkxClient, type WebSocketLike } from "./OkxClient";

type Listener = (event: { data: unknown }) => void;

/** Hand-rolled fake socket: the transport seam this client is built to own. */
class FakeWebSocket implements WebSocketLike {
  readonly sent: string[] = [];
  closeCalls = 0;
  /** When true, a `ping` is answered with `pong`, like a live OKX connection. */
  autoPong = false;
  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(data: string): void {
    this.sent.push(data);
    if (this.autoPong && data === "ping") {
      this.simulateMessage("pong");
    }
  }

  close(): void {
    this.closeCalls += 1;
    this.emit("close");
  }

  // --- test controls ---

  simulateOpen(): void {
    this.emit("open");
  }

  simulateMessage(payload: unknown): void {
    this.emit("message", { data: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }

  simulateDrop(): void {
    this.emit("close");
  }

  simulateError(): void {
    this.emit("error");
  }

  pings(): string[] {
    return this.sent.filter((frame) => frame === "ping");
  }

  private emit(type: string, event: { data: unknown } = { data: undefined }): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function tickerFrame(
  bidPx: string,
  askPx: string,
  overrides: { instId?: string; ts?: string | null } = {},
) {
  const instId = overrides.instId ?? "USDT-BRL";
  const ts = overrides.ts === undefined ? String(Date.now()) : overrides.ts;
  const entry: Record<string, unknown> = { instType: "SPOT", instId, bidPx, bidSz: "10", askPx };
  if (ts !== null) {
    entry.ts = ts;
  }
  return { arg: { channel: "tickers", instId }, data: [entry] };
}

function restBody(bidPx: string, askPx: string, code = "0") {
  return {
    code,
    msg: "",
    data: [{ instId: "USDT-BRL", bidPx, bidSz: "10", askPx, askSz: "10", ts: String(Date.now()) }],
  };
}

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

interface Harness {
  client: OkxClient;
  sockets: FakeWebSocket[];
  factoryCalls: () => number;
  fetchFn: ReturnType<typeof vi.fn>;
  socket: () => FakeWebSocket;
  tickerCalls: () => unknown[][];
  /** Advances fake time and lets the pending REST promises settle. */
  advance: (ms: number) => Promise<void>;
}

function createHarness(
  options: {
    fetchImpl?: () => Response | Promise<Response>;
    autoPong?: boolean;
    failToConnect?: boolean;
  } = {},
): Harness {
  const sockets: FakeWebSocket[] = [];
  let factoryCalls = 0;
  const fetchFn = vi.fn(options.fetchImpl ?? (() => jsonResponse(restBody("4.90", "4.95"))));
  const client = new OkxClient({
    webSocketFactory: () => {
      factoryCalls += 1;
      if (options.failToConnect) {
        throw new Error("ECONNREFUSED");
      }
      const socket = new FakeWebSocket();
      socket.autoPong = options.autoPong ?? false;
      sockets.push(socket);
      return socket;
    },
    fetchFn: fetchFn as unknown as typeof fetch,
    monitorIntervalMs: 1000,
    pingAfterMs: 5000,
    pongTimeoutMs: 3000,
    refreshAfterMs: 5000,
    maxPriceAgeMs: 10_000,
    timeoutMs: 5000,
  });

  return {
    client,
    sockets,
    factoryCalls: () => factoryCalls,
    fetchFn,
    socket: () => {
      const latest = sockets.at(-1);
      if (!latest) {
        throw new Error("no socket was created");
      }
      return latest;
    },
    tickerCalls: () =>
      (fetchFn.mock.calls as unknown as unknown[][]).filter((call) =>
        String(call[0]).includes("/api/v5/market/ticker"),
      ),
    advance: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
  };
}

describe("OkxClient", () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    harness?.client.stop();
    harness = null;
    vi.useRealTimers();
  });

  describe("serving prices from memory", () => {
    it("subscribes to the USDT-BRL tickers channel once the socket opens", () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();

      expect(harness.socket().sent).toHaveLength(1);
      expect(JSON.parse(harness.socket().sent[0])).toEqual({
        op: "subscribe",
        args: [{ channel: "tickers", instId: "USDT-BRL" }],
      });
    });

    it("serves the last known price from memory without waiting on the socket", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));

      const result = await harness.client.getTopOfBook("USDT", "BRL");

      expect(result.status).toBe("available");
      if (result.status === "available") {
        expect(result.bid.toString()).toBe("5");
        expect(result.ask.toString()).toBe("5.02");
      }
      // Read straight from memory: no REST call was needed to answer it.
      expect(harness.fetchFn).not.toHaveBeenCalled();
    });

    it("keeps only the latest price, with no history", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateMessage(tickerFrame("5.10", "5.12"));

      const result = await harness.client.getTopOfBook("USDT", "BRL");

      expect(result.status === "available" && result.ask.toString()).toBe("5.12");
    });

    it("reports unavailable, without blocking, before any price has arrived", async () => {
      harness = createHarness();
      harness.client.start();

      await expect(harness.client.getTopOfBook("USDT", "BRL")).resolves.toEqual({
        status: "unavailable",
        reason: expect.stringContaining("USDT-BRL price received yet"),
      });
    });

    it("reports unavailable for any pair other than USDT/BRL", async () => {
      harness = createHarness();

      await expect(harness.client.getTopOfBook("USDT", "MXN")).resolves.toEqual({
        status: "unavailable",
        reason: expect.stringContaining("USDT/MXN"),
      });
    });

    it("starts the feed on first use so a lookup never blocks on a manual start", async () => {
      harness = createHarness();

      const result = await harness.client.getTopOfBook("USDT", "BRL");

      expect(result.status).toBe("unavailable");
      expect(harness.sockets).toHaveLength(1);
    });
  });

  describe("price freshness", () => {
    it("ages a price from OKX's timestamp, not from when we received it", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      // Just received, but OKX says this price was already 11 seconds old.
      harness
        .socket()
        .simulateMessage(tickerFrame("5.00", "5.02", { ts: String(Date.now() - 11_000) }));

      await expect(harness.client.getTopOfBook("USDT", "BRL")).resolves.toEqual({
        status: "unavailable",
        reason: expect.stringContaining("old"),
      });
    });

    it("falls back to receive time when OKX's timestamp is missing or implausible", async () => {
      for (const ts of [null, "not-a-number", String(Date.now() + 120_000)]) {
        const local = createHarness();
        local.client.start();
        local.socket().simulateOpen();
        local.socket().simulateMessage(tickerFrame("5.00", "5.02", { ts }));

        await expect(local.client.getTopOfBook("USDT", "BRL")).resolves.toMatchObject({
          status: "available",
        });
        local.client.stop();
      }
    });

    it("stops serving a last known price once it is older than a quote's lifetime", async () => {
      harness = createHarness({ fetchImpl: () => Promise.reject(new Error("ECONNREFUSED")) });
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));

      await harness.advance(10_001);

      await expect(harness.client.getTopOfBook("USDT", "BRL")).resolves.toEqual({
        status: "unavailable",
        reason: expect.stringContaining("old"),
      });
    });
  });

  describe("REST fallback", () => {
    it("polls REST every second while the socket is down", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateDrop();

      await harness.advance(3000);

      expect(harness.tickerCalls()).toHaveLength(3);
      expect(String(harness.tickerCalls()[0][0])).toContain("instId=USDT-BRL");
      expect(harness.client.isRestPolling()).toBe(true);
    });

    it("serves REST prices from memory while the socket is down", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateDrop();

      await harness.advance(1000);

      const result = await harness.client.getTopOfBook("USDT", "BRL");
      expect(result.status === "available" && result.ask.toString()).toBe("4.95");
    });

    it("tops up a quiet-but-live socket over REST instead of reconnecting", async () => {
      harness = createHarness({ autoPong: true });
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      const socket = harness.socket();

      // 20 seconds with no ticker update at all: normal for a thin pair on a change-driven
      // channel, and the keepalive proves the connection is alive throughout.
      await harness.advance(20_000);

      expect(harness.sockets).toHaveLength(1);
      expect(socket.closeCalls).toBe(0);
      expect(socket.pings().length).toBeGreaterThanOrEqual(3);
      // One subscribe for the whole period, nowhere near OKX's 480/hour budget.
      expect(socket.sent.filter((frame) => frame !== "ping")).toHaveLength(1);
      // The price stayed quotable the whole time, courtesy of REST top-ups.
      const result = await harness.client.getTopOfBook("USDT", "BRL");
      expect(result.status === "available" && result.ask.toString()).toBe("4.95");
    });

    it("does not poll REST at all while the socket keeps delivering fresh prices", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();

      for (let i = 0; i < 5; i += 1) {
        harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
        await harness.advance(2000);
      }

      expect(harness.fetchFn).not.toHaveBeenCalled();
      expect(harness.client.isRestPolling()).toBe(false);
      expect(harness.socket().pings()).toHaveLength(0);
    });

    it("stops REST polling as soon as WebSocket updates resume", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateDrop();

      // One health check is enough to open a replacement socket.
      await harness.advance(1000);
      expect(harness.sockets).toHaveLength(2);

      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.20", "5.22"));
      const callsAtRecovery = harness.fetchFn.mock.calls.length;

      await harness.advance(4000);

      expect(harness.fetchFn.mock.calls.length).toBe(callsAtRecovery);
      expect(harness.client.isRestPolling()).toBe(false);
      const result = await harness.client.getTopOfBook("USDT", "BRL");
      expect(result.status === "available" && result.ask.toString()).toBe("5.22");
    });

    it("does not overlap REST polls when one request outlives the poll interval", async () => {
      let resolveFirst: (response: Response) => void = () => undefined;
      const firstResponse = new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      });
      const fetchImpl = vi
        .fn()
        .mockImplementationOnce(() => firstResponse)
        .mockImplementation(() => jsonResponse(restBody("4.90", "4.95")));
      harness = createHarness({ fetchImpl: fetchImpl as () => Promise<Response> });
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateDrop();

      await harness.advance(3000);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      resolveFirst(jsonResponse(restBody("4.80", "4.85")));
      await harness.advance(1000);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe("connection liveness", () => {
    it("pings after a silence and reconnects when no pong follows", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      const dead = harness.socket();

      await harness.advance(6000);
      expect(dead.pings()).toHaveLength(1);
      expect(harness.sockets).toHaveLength(1);

      // Nothing answers the ping, so the connection is declared dead and replaced.
      await harness.advance(4000);

      expect(dead.closeCalls).toBe(1);
      expect(harness.sockets).toHaveLength(2);
    });

    it("treats any inbound frame as proof of life, not just ticker updates", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      const socket = harness.socket();

      // Frames we can't use for a price still keep the connection out of the reconnect path.
      for (let i = 0; i < 5; i += 1) {
        await harness.advance(2000);
        socket.simulateMessage("garbage");
      }

      expect(socket.pings()).toHaveLength(0);
      expect(socket.closeCalls).toBe(0);
      expect(harness.sockets).toHaveLength(1);
    });

    it("reconnects on the documented service-upgrade notice", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      const retiring = harness.socket();

      retiring.simulateMessage({
        event: "notice",
        code: "64008",
        msg: "The connection will soon be closed for a service upgrade. Please reconnect.",
        connId: "a4d3ae55",
      });

      expect(retiring.closeCalls).toBe(1);
      expect(harness.sockets).toHaveLength(2);
    });

    it("replaces a socket whose connection never completes", async () => {
      harness = createHarness();
      harness.client.start();

      await harness.advance(6000);

      expect(harness.sockets.length).toBeGreaterThan(1);
      expect(harness.sockets[0].closeCalls).toBe(1);
    });

    it("treats a socket error as a dropped connection", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateError();

      await harness.advance(1000);

      expect(harness.sockets).toHaveLength(2);
      expect(harness.tickerCalls().length).toBeGreaterThanOrEqual(1);
    });

    it("backs off reconnect attempts during an outage instead of retrying every second", async () => {
      harness = createHarness({ failToConnect: true });
      harness.client.start();

      await harness.advance(30_000);

      // Doubling from 1s, attempts land at roughly 0s, 1s, 3s, 7s, 15s and 31s.
      expect(harness.factoryCalls()).toBeLessThanOrEqual(7);
      expect(harness.factoryCalls()).toBeGreaterThanOrEqual(4);
      // REST still covers the price every second throughout the outage.
      expect(harness.tickerCalls().length).toBeGreaterThanOrEqual(25);
    });

    it("resets the backoff once a connection proves itself", async () => {
      harness = createHarness({ failToConnect: false });
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));

      // A proven connection that drops reconnects on the next health check, with no penalty
      // inherited from earlier attempts.
      harness.socket().simulateDrop();
      await harness.advance(1000);
      expect(harness.sockets).toHaveLength(2);

      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateDrop();
      await harness.advance(1000);
      expect(harness.sockets).toHaveLength(3);
    });
  });

  describe("failure handling", () => {
    it("ignores malformed WebSocket frames instead of throwing or caching them", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();

      harness.socket().simulateMessage("not json at all");
      harness.socket().simulateMessage({ event: "error", code: "60012", msg: "Invalid request" });
      harness.socket().simulateMessage(tickerFrame("not-a-number", "5.02"));
      harness.socket().simulateMessage({ arg: { channel: "tickers", instId: "USDT-BRL" } });

      await expect(harness.client.getTopOfBook("USDT", "BRL")).resolves.toEqual({
        status: "unavailable",
        reason: expect.stringContaining("received yet"),
      });
    });

    it("reads OKX's empty price string as a zero, replacing the vanished price", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateMessage(tickerFrame("5.00", ""));

      const result = await harness.client.getTopOfBook("USDT", "BRL");

      // Serving the old 5.02 would quote from an ask that no longer exists on the book.
      expect(result.status).toBe("available");
      if (result.status === "available") {
        expect(result.ask.toString()).toBe("0");
        expect(result.bid.toString()).toBe("5");
      }
    });

    it("keeps a valid ask when only the bid side of the book is empty", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateMessage(tickerFrame("", "5.03"));

      const result = await harness.client.getTopOfBook("USDT", "BRL");

      expect(result.status === "available" && result.ask.toString()).toBe("5.03");
    });

    it("reads an empty price string from the REST fallback as a zero too", async () => {
      harness = createHarness({ fetchImpl: () => jsonResponse(restBody("4.90", "")) });
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02"));
      harness.socket().simulateDrop();

      await harness.advance(1000);

      const result = await harness.client.getTopOfBook("USDT", "BRL");
      expect(result.status === "available" && result.ask.toString()).toBe("0");
    });

    it("ignores a WebSocket frame for another instrument", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      harness.socket().simulateMessage(tickerFrame("5.00", "5.02", { instId: "BTC-USDT" }));

      await expect(harness.client.getTopOfBook("USDT", "BRL")).resolves.toMatchObject({
        status: "unavailable",
      });
    });

    it("returns unavailable rather than throwing when REST fails during the fallback", async () => {
      const failures: Array<() => Response | Promise<Response>> = [
        () => Promise.reject(new Error("ECONNREFUSED")),
        () => Promise.reject(new DOMException("The operation was aborted", "AbortError")),
        () => jsonResponse({}, { ok: false, status: 503 }),
        () => jsonResponse({ code: "51001", msg: "Instrument ID does not exist", data: [] }),
        () => jsonResponse(restBody("not-a-number", "4.95")),
        () =>
          ({
            ok: true,
            status: 200,
            json: () => Promise.reject(new SyntaxError("Unexpected token <")),
          }) as Response,
      ];

      for (const fetchImpl of failures) {
        const local = createHarness({ fetchImpl });
        local.client.start();
        local.socket().simulateOpen();
        local.socket().simulateDrop();

        await local.advance(2000);

        await expect(local.client.getTopOfBook("USDT", "BRL")).resolves.toEqual({
          status: "unavailable",
          reason: expect.any(String),
        });
        local.client.stop();
      }
    });

    it("survives a socket that throws when written to", async () => {
      harness = createHarness();
      harness.client.start();
      const socket = harness.socket();
      socket.send = () => {
        throw new Error("socket closed");
      };
      socket.simulateOpen();

      await harness.advance(2000);

      // The failed subscribe is treated as a lost connection: a replacement is opened and
      // REST covers the price meanwhile, with nothing thrown at the caller.
      expect(harness.sockets.length).toBeGreaterThan(1);
      const result = await harness.client.getTopOfBook("USDT", "BRL");
      expect(result.status === "available" && result.ask.toString()).toBe("4.95");
    });

    it("stops all timers and closes the socket on stop()", async () => {
      harness = createHarness();
      harness.client.start();
      harness.socket().simulateOpen();
      const socket = harness.socket();

      harness.client.stop();
      await harness.advance(5000);

      expect(socket.closeCalls).toBe(1);
      expect(harness.fetchFn).not.toHaveBeenCalled();
      expect(harness.sockets).toHaveLength(1);
    });
  });
});
