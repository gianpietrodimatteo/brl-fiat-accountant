import { describe, expect, it } from "vitest";
import type { ExchangeClient, TopOfBookResult } from "../exchanges/ExchangeClient";
import { FakeBinanceClient } from "../exchanges/FakeBinanceClient";
import { fakePrice, fakeUnavailable } from "../exchanges/FakeExchangeClient";
import { FakeOkxClient } from "../exchanges/FakeOkxClient";
import { MarketDataService } from "./MarketDataService";

// The Simulated Mode defaults this suite leans on: OKX quotes the cheaper BRL ask, so an
// unconfigured pair of fakes already exercises the OKX-wins branch.
const BINANCE_BRL_ASK = "5.41";
const OKX_BRL_ASK = "5.39";

/**
 * A client that breaks the `ExchangeClient` contract by rejecting instead of returning an
 * "unavailable" result. The Simulated Mode fakes deliberately cannot do this — never failing
 * is the point of them — so this is the one behaviour they can't stand in for.
 */
class ThrowingExchangeClient implements ExchangeClient {
  constructor(private readonly failure: string) {}

  getTopOfBook(): Promise<TopOfBookResult> {
    return Promise.reject(new Error(this.failure));
  }
}

describe("MarketDataService", () => {
  describe("USDT/BRL leg", () => {
    it("uses OKX when OKX is the cheaper ask for the client", async () => {
      const binance = new FakeBinanceClient();
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "okx" });
      expect(result.status === "available" && result.usdtBrlAsk.toString()).toBe(OKX_BRL_ASK);
    });

    it("uses Binance when Binance is the cheaper ask for the client", async () => {
      const binance = new FakeBinanceClient();
      const okx = new FakeOkxClient(fakePrice("5.50", "5.55"));

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
      expect(result.status === "available" && result.usdtBrlAsk.toString()).toBe(BINANCE_BRL_ASK);
    });

    it("keeps Binance when both asks are equal", async () => {
      const binance = new FakeBinanceClient();
      const okx = new FakeOkxClient(fakePrice("5.39", BINANCE_BRL_ASK));

      const result = await new MarketDataService(binance, okx).getComposedPrice("EUR");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
    });

    it("falls back to Binance when OKX is unavailable", async () => {
      const binance = new FakeBinanceClient();
      const okx = new FakeOkxClient(fakeUnavailable("No OKX USDT-BRL price received yet"));

      const result = await new MarketDataService(binance, okx).getComposedPrice("ARS");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
      expect(result.status === "available" && result.usdtBrlAsk.toString()).toBe(BINANCE_BRL_ASK);
    });
  });

  describe("USDT/<destino> leg", () => {
    it("sources the destination bid from Binance", async () => {
      const binance = new FakeBinanceClient({ "USDT/COP": fakePrice("4000.00", "4010.00") });
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("COP");

      expect(result.status === "available" && result.usdtDestinationBid.toString()).toBe("4000");
      expect(binance.requestedPairs).toContain("USDT/COP");
    });

    it("never asks OKX for the destination pair, even when OKX wins the BRL leg", async () => {
      const binance = new FakeBinanceClient();
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("ZAR");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "okx" });
      expect(okx.requestedPairs).toEqual(["USDT/BRL"]);
    });

    it("reports no quote capability when Binance cannot serve the destination pair", async () => {
      const binance = new FakeBinanceClient({
        "USDT/MXN": fakeUnavailable("Binance bookTicker returned HTTP 503"),
      });
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result.status).toBe("no_quote_capability");
    });

    it("reports no quote capability for a currency Binance has no pair for", async () => {
      const binance = new FakeBinanceClient();
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("JPY");

      expect(result).toMatchObject({ status: "no_quote_capability" });
      expect(result.status === "no_quote_capability" && result.reason).toContain(
        "No Binance trading pair found for USDT/JPY",
      );
    });
  });

  describe("availability", () => {
    it("reports no quote capability when Binance is unavailable but OKX is not", async () => {
      const outage = fakeUnavailable("Binance exchangeInfo returned HTTP 500");
      const binance = new FakeBinanceClient({ "USDT/BRL": outage, "USDT/MXN": outage });
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "no_quote_capability" });
      expect(result.status === "no_quote_capability" && result.reason).toContain("HTTP 500");
    });

    it("reports no quote capability when both exchanges are unavailable", async () => {
      const outage = fakeUnavailable("Binance bookTicker request failed: timeout");
      const binance = new FakeBinanceClient({ "USDT/BRL": outage, "USDT/MXN": outage });
      const okx = new FakeOkxClient(fakeUnavailable("socket closed"));

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result.status).toBe("no_quote_capability");
    });

    it("never returns a partial price when only one Binance leg is available", async () => {
      const binance = new FakeBinanceClient({
        "USDT/BRL": fakeUnavailable("malformed Binance bookTicker response"),
      });
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toEqual({
        status: "no_quote_capability",
        reason: "Binance USDT/BRL unavailable: malformed Binance bookTicker response",
      });
    });
  });

  describe("client failures never escape as exceptions", () => {
    it("treats a throwing OKX client as an unavailable OKX", async () => {
      const binance = new FakeBinanceClient();
      const okx = new ThrowingExchangeClient("connection drop");

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
      expect(result.status === "available" && result.usdtBrlAsk.toString()).toBe(BINANCE_BRL_ASK);
    });

    it("treats a throwing Binance client as no quote capability", async () => {
      const binance = new ThrowingExchangeClient("timeout");
      const okx = new FakeOkxClient();

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "no_quote_capability" });
      expect(result.status === "no_quote_capability" && result.reason).toContain("timeout");
    });

    it("resolves when every client throws", async () => {
      const binance = new ThrowingExchangeClient("timeout");
      const okx = new ThrowingExchangeClient("connection drop");

      await expect(
        new MarketDataService(binance, okx).getComposedPrice("MXN"),
      ).resolves.toMatchObject({ status: "no_quote_capability" });
    });
  });
});
