import { BinanceClient } from "./BinanceClient";
import type { ExchangeClient } from "./ExchangeClient";
import { FakeBinanceClient } from "./FakeBinanceClient";
import { FakeOkxClient } from "./FakeOkxClient";
import { OkxClient } from "./OkxClient";

export const EXCHANGE_MODE_ENV_VAR = "EXCHANGE_MODE";

export type ExchangeMode = "live" | "simulated";

/** Live is the default: Simulated Mode has to be asked for explicitly. */
const DEFAULT_MODE: ExchangeMode = "live";

export interface ExchangeClients {
  binance: ExchangeClient;
  okx: ExchangeClient;
}

/**
 * Reads the startup toggle. An unrecognised value is a startup failure rather than a silent
 * fallback, so a typo can never leave the process quietly calling the real exchanges.
 */
export function resolveExchangeMode(env: NodeJS.ProcessEnv = process.env): ExchangeMode {
  const configured = env[EXCHANGE_MODE_ENV_VAR]?.trim().toLowerCase();
  if (configured === undefined || configured === "") {
    return DEFAULT_MODE;
  }
  if (configured === "live" || configured === "simulated") {
    return configured;
  }

  throw new Error(
    `Invalid ${EXCHANGE_MODE_ENV_VAR}: "${env[EXCHANGE_MODE_ENV_VAR]}". Expected "live" or "simulated".`,
  );
}

/**
 * The only place that knows both implementations exist. Everything downstream receives the
 * `ExchangeClient` interface and behaves identically in either mode.
 */
export function createExchangeClients(mode: ExchangeMode): ExchangeClients {
  if (mode === "simulated") {
    return { binance: new FakeBinanceClient(), okx: new FakeOkxClient() };
  }

  return { binance: new BinanceClient(), okx: new OkxClient() };
}

/** Read once, at process start, so the mode can't shift under a running process. */
export const activeExchangeMode: ExchangeMode = resolveExchangeMode();

let clients: ExchangeClients | null = null;

/** The app-wide client pair for the active mode, created on first use and shared after that. */
export function getExchangeClients(): ExchangeClients {
  clients ??= createExchangeClients(activeExchangeMode);
  return clients;
}
