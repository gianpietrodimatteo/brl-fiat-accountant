import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBinanceClient } from "./FakeBinanceClient";
import { fakeUnavailable } from "./FakeExchangeClient";
import { FakeOkxClient } from "./FakeOkxClient";

/** Turns any network access into a loud failure, so a fake that reached out would be caught. */
function forbidNetwork(): {
  fetchSpy: ReturnType<typeof vi.fn>;
  socketSpy: ReturnType<typeof vi.fn>;
} {
  const fetchSpy = vi.fn(() => {
    throw new Error("fetch is forbidden in Simulated Mode");
  });
  const socketSpy = vi.fn(() => {
    throw new Error("WebSocket is forbidden in Simulated Mode");
  });
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("WebSocket", socketSpy);
  return { fetchSpy, socketSpy };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FakeOkxClient", () => {
  it("serves the BRL leg from memory", async () => {
    const result = await new FakeOkxClient().getTopOfBook("USDT", "BRL");

    expect(result).toMatchObject({ status: "available" });
    expect(result.status === "available" && result.ask.greaterThan(result.bid)).toBe(true);
  });

  it("quotes a cheaper BRL ask than the Binance fake, so the OKX leg is exercised", async () => {
    const okx = await new FakeOkxClient().getTopOfBook("USDT", "BRL");
    const binance = await new FakeBinanceClient().getTopOfBook("USDT", "BRL");

    expect(
      okx.status === "available" && binance.status === "available" && okx.ask.lessThan(binance.ask),
    ).toBe(true);
  });

  it("refuses any pair other than USDT/BRL, the way the real client does", async () => {
    const result = await new FakeOkxClient().getTopOfBook("USDT", "MXN");

    expect(result).toEqual({
      status: "unavailable",
      reason: "OKX client only serves USDT/BRL, not USDT/MXN",
    });
  });

  it("lets a consumer simulate OKX being down", async () => {
    const client = new FakeOkxClient(fakeUnavailable("No OKX USDT-BRL price received yet"));

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result).toMatchObject({ status: "unavailable" });
  });

  it("records the pairs it was asked for", async () => {
    const client = new FakeOkxClient();

    await client.getTopOfBook("USDT", "BRL");
    await client.getTopOfBook("USDT", "EUR");

    expect(client.requestedPairs).toEqual(["USDT/BRL", "USDT/EUR"]);
  });

  it("opens no socket and makes no network calls", async () => {
    const { fetchSpy, socketSpy } = forbidNetwork();

    const client = new FakeOkxClient();
    await client.getTopOfBook("USDT", "BRL");
    await client.getTopOfBook("USDT", "EUR");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
  });
});
