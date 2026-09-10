import type Database from "better-sqlite3";
import { UserRepository } from "./repositories/UserRepository";
import { SupportedCurrencyRepository } from "./repositories/SupportedCurrencyRepository";

const SEED_USERS = [
  { username: "alice", spreadBasisPoints: 0 },
  { username: "bob", spreadBasisPoints: 60 },
  { username: "carol", spreadBasisPoints: 100 },
];

const SEED_CURRENCIES = ["EUR", "ARS", "COP", "MXN", "ZAR"];

/** Idempotently seeds the pre-defined users and supported currencies. */
export function seedDatabase(db: Database.Database): void {
  const userRepository = new UserRepository(db);
  const currencyRepository = new SupportedCurrencyRepository(db);

  for (const user of SEED_USERS) {
    userRepository.insertIfNotExists(user.username, user.spreadBasisPoints);
  }

  for (const code of SEED_CURRENCIES) {
    currencyRepository.insertIfNotExists(code);
  }
}
