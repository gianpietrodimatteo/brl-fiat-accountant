import type Database from "better-sqlite3";
import type { SupportedCurrency } from "../domain/SupportedCurrency";

interface SupportedCurrencyRow {
  code: string;
  name: string | null;
}

function toDomain(row: SupportedCurrencyRow): SupportedCurrency {
  return { code: row.code, name: row.name };
}

export class SupportedCurrencyRepository {
  constructor(private readonly db: Database.Database) {}

  listAll(): SupportedCurrency[] {
    const rows = this.db
      .prepare("SELECT * FROM supported_currencies")
      .all() as SupportedCurrencyRow[];
    return rows.map(toDomain);
  }

  isSupported(code: string): boolean {
    const row = this.db.prepare("SELECT 1 FROM supported_currencies WHERE code = ?").get(code);
    return row !== undefined;
  }
}
