import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type { ExchangeClient, TopOfBookResult } from "../exchanges/ExchangeClient";
import { MarketDataService } from "./MarketDataService";

type PairKey = string;

function pairKey(baseAsset: string, quoteAsset: string): PairKey {
  return `${baseAsset}/${quoteAsset}`;
}

function available(bid: string, ask: string): TopOfBookResult {
  return { status: "available", bid: new Decimal(bid), ask: new Decimal(ask) };
}

function unavailable(reason: string): TopOfBookResult {
  return { status: "unavailable", reason };
}

/**
 * Stands in for a [[3-1]]/[[3-2]] client. A pair mapped to an `Error` rejects, which is how a
 * timeout or a dropped connection would look if a client ever failed to contain one.
 */
class StubExchangeClient implements ExchangeClient {
  readonly requestedPairs: PairKey[] = [];

  constructor(private readonly responses: Record<PairKey, TopOfBookResult | Error>) {}

  getTopOfBook(baseAsset: string, quoteAsset: string): Promise<TopOfBookResult> {
    const key = pairKey(baseAsset, quoteAsset);
    this.requestedPairs.push(key);

    const response = this.responses[key];
    if (response === undefined) {
      return Promise.resolve(unavailable(`stub has no price for ${key}`));
    }
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    return Promise.resolve(response);
  }
}

describe("MarketDataService", () => {
  describe("USDT/BRL leg", () => {
    it("uses OKX when OKX is the cheaper ask for the client", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.10"),
        "USDT/MXN": available("16.00", "16.10"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("4.90", "4.95") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "okx" });
      expect(result.status === "available" && result.usdtBrlAsk.toString()).toBe("4.95");
    });

    it("uses Binance when Binance is the cheaper ask for the client", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.05"),
        "USDT/MXN": available("16.00", "16.10"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("5.20", "5.30") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
      expect(result.status === "available" && result.usdtBrlAsk.toString()).toBe("5.05");
    });

    it("keeps Binance when both asks are equal", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.10"),
        "USDT/EUR": available("0.90", "0.91"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("5.00", "5.10") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("EUR");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
    });

    it("falls back to Binance when OKX is unavailable", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.10"),
        "USDT/ARS": available("900.00", "905.00"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": unavailable("no OKX price received yet") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("ARS");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
      expect(result.status === "available" && result.usdtBrlAsk.toString()).toBe("5.1");
    });
  });

  describe("USDT/<destino> leg", () => {
    it("sources the destination bid from Binance", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.10"),
        "USDT/COP": available("4000.00", "4010.00"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("4.80", "4.85") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("COP");

      expect(result.status === "available" && result.usdtDestinationBid.toString()).toBe("4000");
      expect(binance.requestedPairs).toContain("USDT/COP");
    });

    it("never asks OKX for the destination pair, even when OKX wins the BRL leg", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.10"),
        "USDT/ZAR": available("18.00", "18.20"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("4.80", "4.85") });

      await new MarketDataService(binance, okx).getComposedPrice("ZAR");

      expect(okx.requestedPairs).toEqual(["USDT/BRL"]);
    });

    it("reports no quote capability when Binance cannot serve the destination pair", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.10"),
        "USDT/MXN": unavailable("Binance bookTicker returned HTTP 503"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("4.80", "4.85") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result.status).toBe("no_quote_capability");
    });
  });

  describe("availability", () => {
    it("reports no quote capability when Binance is unavailable but OKX is not", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": unavailable("Binance exchangeInfo returned HTTP 500"),
        "USDT/MXN": unavailable("Binance exchangeInfo returned HTTP 500"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("4.80", "4.85") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "no_quote_capability" });
      expect(result.status === "no_quote_capability" && result.reason).toContain("HTTP 500");
    });

    it("reports no quote capability when both exchanges are unavailable", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": unavailable("Binance bookTicker request failed: timeout"),
        "USDT/MXN": unavailable("Binance bookTicker request failed: timeout"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": unavailable("socket closed") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result.status).toBe("no_quote_capability");
    });

    it("never returns a partial price when only one Binance leg is available", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": unavailable("malformed Binance bookTicker response"),
        "USDT/MXN": available("16.00", "16.10"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("4.80", "4.85") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toEqual({
        status: "no_quote_capability",
        reason: "Binance USDT/BRL unavailable: malformed Binance bookTicker response",
      });
    });
  });

  describe("client failures never escape as exceptions", () => {
    it("treats a throwing OKX client as an unavailable OKX", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": available("5.00", "5.10"),
        "USDT/MXN": available("16.00", "16.10"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": new Error("connection drop") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "available", usdtBrlSource: "binance" });
    });

    it("treats a throwing Binance client as no quote capability", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": new Error("timeout"),
        "USDT/MXN": new Error("timeout"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": available("4.80", "4.85") });

      const result = await new MarketDataService(binance, okx).getComposedPrice("MXN");

      expect(result).toMatchObject({ status: "no_quote_capability" });
      expect(result.status === "no_quote_capability" && result.reason).toContain("timeout");
    });

    it("resolves when every client throws", async () => {
      const binance = new StubExchangeClient({
        "USDT/BRL": new Error("timeout"),
        "USDT/MXN": new Error("malformed response"),
      });
      const okx = new StubExchangeClient({ "USDT/BRL": new Error("connection drop") });

      await expect(
        new MarketDataService(binance, okx).getComposedPrice("MXN"),
      ).resolves.toMatchObject({ status: "no_quote_capability" });
    });
  });
});
