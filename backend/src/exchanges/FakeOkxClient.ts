import type { TopOfBookResult } from "./ExchangeClient";
import { FakeExchangeClient, fakePrice } from "./FakeExchangeClient";

// The real OKX client is only ever used for the BRL leg, so this fake serves the same single
// instrument and nothing else.
const INSTRUMENT_PAIR = "USDT/BRL";
// Slightly below the Binance fake's ask, so Simulated Mode exercises the branch where OKX wins
// the BRL leg rather than always falling back to Binance.
const SIMULATED_USDT_BRL = fakePrice("5.37", "5.39");

/**
 * Simulated Mode stand-in for `OkxClient`: same interface, same single instrument, same
 * "unavailable" wording for any other pair — but backed by memory instead of a WebSocket, so
 * it opens no connection and has nothing to reconnect or poll.
 *
 * The one price it serves is the whole of its configuration: pass an `unavailable` result to
 * simulate OKX being down, which is what a consumer needs to exercise the Binance-only path.
 */
export class FakeOkxClient extends FakeExchangeClient {
  constructor(usdtBrl: TopOfBookResult = SIMULATED_USDT_BRL) {
    super({ [INSTRUMENT_PAIR]: usdtBrl });
  }

  protected unavailableReason(pair: string): string {
    return `OKX client only serves ${INSTRUMENT_PAIR}, not ${pair}`;
  }
}
