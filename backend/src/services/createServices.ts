import type Database from "better-sqlite3";
import type { ExchangeClients } from "../exchanges/exchangeClients";
import { QuoteRepository } from "../repositories/QuoteRepository";
import { SessionRepository } from "../repositories/SessionRepository";
import { SupportedCurrencyRepository } from "../repositories/SupportedCurrencyRepository";
import { UserRepository } from "../repositories/UserRepository";
import { MarketDataService } from "./MarketDataService";
import { QuoteService, type Clock } from "./QuoteService";
import { SessionService } from "./SessionService";

export interface ServiceDependencies {
  db: Database.Database;
  exchangeClients: ExchangeClients;
  /** Defaults to the system clock; tests inject one to move time without waiting. */
  clock?: Clock;
}

export interface Services {
  sessionService: SessionService;
  marketDataService: MarketDataService;
  quoteService: QuoteService;
}

/**
 * Wires every service to its repositories over one database handle. Which exchange clients are
 * live or simulated is already decided by the caller, so nothing here knows either mode exists.
 */
export function createServices({ db, exchangeClients, clock }: ServiceDependencies): Services {
  const userRepository = new UserRepository(db);
  const sessionRepository = new SessionRepository(db);
  const supportedCurrencyRepository = new SupportedCurrencyRepository(db);
  const quoteRepository = new QuoteRepository(db);

  const marketDataService = new MarketDataService(exchangeClients.binance, exchangeClients.okx);

  return {
    sessionService: new SessionService(userRepository, sessionRepository),
    marketDataService,
    quoteService: new QuoteService(
      userRepository,
      supportedCurrencyRepository,
      quoteRepository,
      marketDataService,
      clock,
    ),
  };
}
