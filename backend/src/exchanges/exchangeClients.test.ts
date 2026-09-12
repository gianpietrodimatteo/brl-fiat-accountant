import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketDataService } from "../services/MarketDataService";
import { BinanceClient } from "./BinanceClient";
import {
  activeExchangeMode,
  createExchangeClients,
  EXCHANGE_MODE_ENV_VAR,
  getExchangeClients,
  resolveExchangeMode,
} from "./exchangeClients";
import { FakeBinanceClient } from "./FakeBinanceClient";
import { FakeOkxClient } from "./FakeOkxClient";
import { OkxClient } from "./OkxClient";

function env(value?: string): NodeJS.ProcessEnv {
  return value === undefined ? {} : { [EXCHANGE_MODE_ENV_VAR]: value };
}

/** Turns any network access into a loud failure, so a live client slipping through is caught. */
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

describe("resolveExchangeMode", () => {
  it("defaults to live when the toggle is unset", () => {
    expect(resolveExchangeMode(env())).toBe("live");
  });

  it("treats an empty or blank value as unset", () => {
    expect(resolveExchangeMode(env(""))).toBe("live");
    expect(resolveExchangeMode(env("   "))).toBe("live");
  });

  it("reads the documented simulated value", () => {
    expect(resolveExchangeMode(env("simulated"))).toBe("simulated");
  });

  it("reads the explicit live value", () => {
    expect(resolveExchangeMode(env("live"))).toBe("live");
  });

  it("ignores surrounding whitespace and casing", () => {
    expect(resolveExchangeMode(env("  SIMULATED  "))).toBe("simulated");
  });

  it("fails at startup on an unrecognised value rather than quietly going live", () => {
    expect(() => resolveExchangeMode(env("simulate"))).toThrow(/EXCHANGE_MODE/);
  });
});

describe("createExchangeClients", () => {
  it("selects the local fakes in simulated mode", () => {
    const clients = createExchangeClients("simulated");

    expect(clients.binance).toBeInstanceOf(FakeBinanceClient);
    expect(clients.okx).toBeInstanceOf(FakeOkxClient);
  });

  it("selects the real clients in live mode", () => {
    const clients = createExchangeClients("live");

    expect(clients.binance).toBeInstanceOf(BinanceClient);
    expect(clients.okx).toBeInstanceOf(OkxClient);
  });
});

describe("getExchangeClients", () => {
  it("shares one client pair matching the mode read at process start", () => {
    const clients = getExchangeClients();

    expect(getExchangeClients()).toBe(clients);
    if (activeExchangeMode === "simulated") {
      expect(clients.binance).toBeInstanceOf(FakeBinanceClient);
      expect(clients.okx).toBeInstanceOf(FakeOkxClient);
    } else {
      expect(clients.binance).toBeInstanceOf(BinanceClient);
      expect(clients.okx).toBeInstanceOf(OkxClient);
    }
  });
});

describe("simulated mode end to end", () => {
  it("composes a price through MarketDataService without touching the network", async () => {
    const { fetchSpy, socketSpy } = forbidNetwork();
    const clients = createExchangeClients("simulated");

    const result = await new MarketDataService(clients.binance, clients.okx).getComposedPrice(
      "MXN",
    );

    expect(result).toMatchObject({
      status: "available",
      destinationCurrency: "MXN",
      usdtBrlSource: "okx",
    });
    expect(result.status === "available" && result.usdtDestinationBid.isPositive()).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
  });

  it("falls back to the Binance fake for the BRL leg when the OKX fake is down", async () => {
    const binance = new FakeBinanceClient();
    const okx = new FakeOkxClient({ status: "unavailable", reason: "simulated OKX outage" });

    const result = await new MarketDataService(binance, okx).getComposedPrice("EUR");

    expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
  });
});
