import { FakeExchangeClient, fakePrices, type FakePriceTable } from "./FakeExchangeClient";

/**
 * Plausible standing prices for the bridge asset against BRL and every supported destination
 * currency, in the same shape Binance's book ticker reports: ask above bid.
 *
 * Each pair is keyed in the order live Binance lists it. EUR trades there only as EUR/USDT, so
 * Simulated Mode prices EUR from that pair's ask exactly as live mode has to.
 */
const SIMULATED_PRICES = fakePrices({
  "USDT/BRL": { bid: "5.39", ask: "5.41" },
  "EUR/USDT": { bid: "1.09", ask: "1.10" },
  "USDT/ARS": { bid: "1010.00", ask: "1015.00" },
  "USDT/COP": { bid: "3950.00", ask: "3975.00" },
  "USDT/MXN": { bid: "18.20", ask: "18.30" },
  "USDT/ZAR": { bid: "17.80", ask: "17.90" },
});

/**
 * Simulated Mode stand-in for `BinanceClient`: same interface, same "unlisted" wording for a
 * pair it doesn't list, no network access at all.
 */
export class FakeBinanceClient extends FakeExchangeClient {
  constructor(overrides: FakePriceTable = {}) {
    super(SIMULATED_PRICES, overrides);
  }

  protected unlistedReason(pair: string): string {
    return `No Binance trading pair found for ${pair}`;
  }
}
