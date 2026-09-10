import type Database from "better-sqlite3";
import type { Quote } from "../domain/Quote";

interface QuoteRow {
  id: number;
  user_id: number;
  destination_currency: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  expires_at: string;
  confirmed_at: string | null;
}

export interface NewQuote {
  userId: number;
  destinationCurrency: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  expiresAt: Date;
}

export type ConfirmQuoteResult = "confirmed" | "already_confirmed" | "not_found";

function toDomain(row: QuoteRow): Quote {
  return {
    id: row.id,
    userId: row.user_id,
    destinationCurrency: row.destination_currency,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
  };
}

export class QuoteRepository {
  constructor(private readonly db: Database.Database) {}

  create(newQuote: NewQuote): Quote {
    const info = this.db
      .prepare(
        `INSERT INTO quotes (user_id, destination_currency, quantity, unit_price, total_price, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newQuote.userId,
        newQuote.destinationCurrency,
        newQuote.quantity,
        newQuote.unitPrice,
        newQuote.totalPrice,
        newQuote.expiresAt.toISOString(),
      );

    const quote = this.findById(Number(info.lastInsertRowid));
    if (!quote) {
      throw new Error("Failed to read back newly created quote");
    }
    return quote;
  }

  findById(id: number): Quote | null {
    const row = this.db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as
      QuoteRow | undefined;
    return row ? toDomain(row) : null;
  }

  listConfirmedForUser(userId: number): Quote[] {
    const rows = this.db
      .prepare("SELECT * FROM quotes WHERE user_id = ? AND confirmed_at IS NOT NULL")
      .all(userId) as QuoteRow[];
    return rows.map(toDomain);
  }

  /**
   * Atomically confirms a quote: the UPDATE's WHERE clause only matches an
   * unconfirmed row, so concurrent callers racing on the same id can never both
   * report success — the DB serializes the write and exactly one changes a row.
   */
  confirmQuote(id: number): ConfirmQuoteResult {
    const result = this.db
      .prepare(
        "UPDATE quotes SET confirmed_at = datetime('now') WHERE id = ? AND confirmed_at IS NULL",
      )
      .run(id);

    if (result.changes === 1) {
      return "confirmed";
    }

    const exists = this.db.prepare("SELECT 1 FROM quotes WHERE id = ?").get(id);
    return exists ? "already_confirmed" : "not_found";
  }
}
