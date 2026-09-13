import type Database from "better-sqlite3";
import type { Quote } from "../domain/Quote";
import { isExpired } from "../domain/quoteLifecycle";

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
  /**
   * Written explicitly rather than left to the column's `datetime('now')` default, whose
   * `YYYY-MM-DD HH:MM:SS` form has no timezone designator and would parse as local time.
   */
  createdAt: Date;
  expiresAt: Date;
}

export interface ConfirmQuoteAttempt {
  quoteId: number;
  /** The caller. Only the quote's owner can confirm it. */
  userId: number;
  /** The instant of the attempt, written as `confirmed_at` and checked against `expires_at`. */
  now: Date;
}

/**
 * Every outcome of a confirmation attempt. Only `confirmed` carries the quote: a rejection,
 * `not_owner` above all, never hands the caller anything about someone else's quote.
 */
export type ConfirmQuoteResult =
  | { status: "confirmed"; quote: Quote }
  | { status: "already_confirmed" }
  | { status: "expired" }
  | { status: "not_found" }
  | { status: "not_owner" };

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
        `INSERT INTO quotes (user_id, destination_currency, quantity, unit_price, total_price, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newQuote.userId,
        newQuote.destinationCurrency,
        newQuote.quantity,
        newQuote.unitPrice,
        newQuote.totalPrice,
        newQuote.createdAt.toISOString(),
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

  /**
   * A user's confirmed quotes, most recently confirmed first. `confirmed_at` is always written as
   * an ISO 8601 UTC string, so ordering the text orders the instants; `id` breaks a tie within the
   * same millisecond.
   */
  listConfirmedForUser(userId: number): Quote[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM quotes
         WHERE user_id = ? AND confirmed_at IS NOT NULL
         ORDER BY confirmed_at DESC, id DESC`,
      )
      .all(userId) as QuoteRow[];
    return rows.map(toDomain);
  }

  /**
   * Confirms a quote exactly once, only for its owner, and only inside its validity window.
   *
   * Every condition lives in the one `UPDATE`'s `WHERE` clause, so nothing can change between
   * checking it and writing: concurrent callers racing on the same id are serialized by SQLite and
   * exactly one of them changes the row, and a quote that expires after some earlier read still
   * cannot be confirmed.
   *
   * `expires_at >= now` is the negation of `isExpired` — valid at exactly `expires_at`, expired one
   * millisecond later. Both sides are `toISOString()` strings, whose fixed-width form sorts
   * chronologically as text.
   *
   * When the write matches nothing, the explaining read runs in the same transaction, so it sees
   * the row the `UPDATE` just rejected rather than a later one.
   */
  confirmQuote({ quoteId, userId, now }: ConfirmQuoteAttempt): ConfirmQuoteResult {
    const nowIso = now.toISOString();

    return this.db.transaction((): ConfirmQuoteResult => {
      const confirmedRow = this.db
        .prepare(
          `UPDATE quotes SET confirmed_at = @nowIso
           WHERE id = @quoteId
             AND user_id = @userId
             AND confirmed_at IS NULL
             AND expires_at >= @nowIso
           RETURNING *`,
        )
        .get({ quoteId, userId, nowIso }) as QuoteRow | undefined;

      if (confirmedRow) {
        return { status: "confirmed", quote: toDomain(confirmedRow) };
      }

      const quote = this.findById(quoteId);
      if (!quote) {
        return { status: "not_found" };
      }
      // Ownership comes first, so someone else's quote never gives away whether it was confirmed
      // or has expired.
      if (quote.userId !== userId) {
        return { status: "not_owner" };
      }
      // A confirmation stands once it is recorded, even after the window it happened in closes.
      if (quote.confirmedAt) {
        return { status: "already_confirmed" };
      }
      if (isExpired(quote, now)) {
        return { status: "expired" };
      }
      throw new Error(`Quote ${quoteId} was confirmable but the confirmation matched no row`);
    })();
  }
}
