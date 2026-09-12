import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeBinanceClient } from "./FakeBinanceClient";
import { fakePrice, fakeUnavailable } from "./FakeExchangeClient";

const SUPPORTED_DESTINATIONS = ["EUR", "ARS", "COP", "MXN", "ZAR"];

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

describe("FakeBinanceClient", () => {
  it("serves the BRL leg", async () => {
    const result = await new FakeBinanceClient().getTopOfBook("USDT", "BRL");

    expect(result).toMatchObject({ status: "available" });
    expect(result.status === "available" && result.ask.greaterThan(result.bid)).toBe(true);
  });

  it.each(SUPPORTED_DESTINATIONS)("serves the USDT/%s destination leg", async (currency) => {
    const result = await new FakeBinanceClient().getTopOfBook("USDT", currency);

    expect(result).toMatchObject({ status: "available" });
    expect(result.status === "available" && result.bid.isPositive()).toBe(true);
  });

  it("reports an unknown pair the way the real client does", async () => {
    const result = await new FakeBinanceClient().getTopOfBook("USDT", "JPY");

    expect(result).toEqual({
      status: "unavailable",
      reason: "No Binance trading pair found for USDT/JPY",
    });
  });

  it("lets a consumer override a price", async () => {
    const client = new FakeBinanceClient({ "USDT/MXN": fakePrice("16.00", "16.10") });

    const result = await client.getTopOfBook("USDT", "MXN");

    expect(result.status === "available" && result.bid.toString()).toBe("16");
  });

  it("lets a consumer simulate Binance being down for a pair", async () => {
    const client = new FakeBinanceClient({
      "USDT/BRL": fakeUnavailable("Binance bookTicker returned HTTP 503"),
    });

    const result = await client.getTopOfBook("USDT", "BRL");

    expect(result).toMatchObject({ status: "unavailable" });
  });

  it("records the pairs it was asked for", async () => {
    const client = new FakeBinanceClient();

    await client.getTopOfBook("USDT", "BRL");
    await client.getTopOfBook("USDT", "EUR");

    expect(client.requestedPairs).toEqual(["USDT/BRL", "USDT/EUR"]);
  });

  it("makes no network calls", async () => {
    const { fetchSpy, socketSpy } = forbidNetwork();

    const client = new FakeBinanceClient();
    await client.getTopOfBook("USDT", "BRL");
    await client.getTopOfBook("USDT", "ZAR");
    await client.getTopOfBook("USDT", "JPY");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
  });
});
