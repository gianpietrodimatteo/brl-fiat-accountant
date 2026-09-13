import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { isExpired } from "../domain/quoteLifecycle";
import type { Quote } from "../domain/Quote";
import { QuoteRepository, type ConfirmQuoteAttempt, type NewQuote } from "./QuoteRepository";

const CREATED_AT = new Date("2026-09-12T10:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-12T10:00:10.000Z");

function millisecondsAfter(instant: Date, milliseconds: number): Date {
  return new Date(instant.getTime() + milliseconds);
}

describe("QuoteRepository", () => {
  let db: Database.Database;
  let repository: QuoteRepository;
  let userId: number;
  let otherUserId: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);
    repository = new QuoteRepository(db);

    ({ userId, otherUserId } = seedUsersAndCurrency(db));
  });

  afterEach(() => {
    db.close();
  });

  function newQuote(overrides: Partial<NewQuote> = {}): NewQuote {
    return {
      userId,
      destinationCurrency: "MXN",
      quantity: 10000,
      unitPrice: 314,
      totalPrice: 3144,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
      ...overrides,
    };
  }

  function attempt(
    quote: Quote,
    overrides: Partial<ConfirmQuoteAttempt> = {},
  ): ConfirmQuoteAttempt {
    return { quoteId: quote.id, userId: quote.userId, now: CREATED_AT, ...overrides };
  }

  function storedConfirmedAt(id: number): string | null {
    const row = db.prepare("SELECT confirmed_at FROM quotes WHERE id = ?").get(id) as {
      confirmed_at: string | null;
    };
    return row.confirmed_at;
  }

  it("creates a quote and reads it back", () => {
    const created = repository.create(newQuote());

    const found = repository.findById(created.id);

    expect(found).toEqual(
      expect.objectContaining({
        userId,
        destinationCurrency: "MXN",
        quantity: 10000,
        unitPrice: 314,
        totalPrice: 3144,
        confirmedAt: null,
      }),
    );
  });

  it("stores created_at as the given ISO UTC instant rather than SQLite's datetime('now')", () => {
    const created = repository.create(newQuote());

    const row = db
      .prepare("SELECT created_at, expires_at FROM quotes WHERE id = ?")
      .get(created.id) as { created_at: string; expires_at: string };
    expect(row).toEqual({
      created_at: "2026-09-12T10:00:00.000Z",
      expires_at: "2026-09-12T10:00:10.000Z",
    });
    expect(created.createdAt.getTime()).toBe(CREATED_AT.getTime());
  });

  it("returns null when a quote id does not exist", () => {
    expect(repository.findById(999)).toBeNull();
  });

  describe("listConfirmedForUser", () => {
    it("lists only that user's confirmed quotes", () => {
      const confirmed = repository.create(newQuote());
      repository.create(newQuote());
      const othersConfirmed = repository.create(newQuote({ userId: otherUserId }));

      repository.confirmQuote(attempt(confirmed));
      repository.confirmQuote(attempt(othersConfirmed));

      const history = repository.listConfirmedForUser(userId);

      expect(history.map((quote) => quote.id)).toEqual([confirmed.id]);
      expect(history[0].confirmedAt).not.toBeNull();
    });

    it("orders by confirmation, most recent first, not by creation", () => {
      const older = repository.create(newQuote());
      const newer = repository.create(
        newQuote({ createdAt: millisecondsAfter(CREATED_AT, 1_000) }),
      );

      repository.confirmQuote(attempt(newer, { now: millisecondsAfter(CREATED_AT, 2_000) }));
      repository.confirmQuote(attempt(older, { now: millisecondsAfter(CREATED_AT, 3_000) }));

      expect(repository.listConfirmedForUser(userId).map((quote) => quote.id)).toEqual([
        older.id,
        newer.id,
      ]);
    });

    it("breaks a same-instant tie by id, newest first", () => {
      const first = repository.create(newQuote());
      const second = repository.create(newQuote());

      repository.confirmQuote(attempt(first));
      repository.confirmQuote(attempt(second));

      expect(repository.listConfirmedForUser(userId).map((quote) => quote.id)).toEqual([
        second.id,
        first.id,
      ]);
    });
  });

  describe("confirmQuote", () => {
    it("confirms an unconfirmed quote exactly once, returning it", () => {
      const quote = repository.create(newQuote());
      const now = millisecondsAfter(CREATED_AT, 4_000);

      const first = repository.confirmQuote(attempt(quote, { now }));

      expect(first).toEqual({
        status: "confirmed",
        quote: { ...quote, confirmedAt: now },
      });
      expect(repository.confirmQuote(attempt(quote, { now }))).toEqual({
        status: "already_confirmed",
      });
    });

    it("writes confirmed_at as the given ISO UTC instant rather than SQLite's datetime('now')", () => {
      const quote = repository.create(newQuote());

      repository.confirmQuote(attempt(quote, { now: new Date("2026-09-12T10:00:05.123Z") }));

      expect(storedConfirmedAt(quote.id)).toBe("2026-09-12T10:00:05.123Z");
    });

    it("reports 'not_found' for a non-existent quote", () => {
      expect(repository.confirmQuote({ quoteId: 999, userId, now: CREATED_AT })).toEqual({
        status: "not_found",
      });
    });

    describe("the expiry boundary, which must agree with isExpired", () => {
      it("confirms at exactly expires_at", () => {
        const quote = repository.create(newQuote());

        expect(isExpired(quote, EXPIRES_AT)).toBe(false);
        expect(repository.confirmQuote(attempt(quote, { now: EXPIRES_AT })).status).toBe(
          "confirmed",
        );
      });

      it("rejects one millisecond past expires_at, leaving confirmed_at NULL", () => {
        const quote = repository.create(newQuote());
        const now = millisecondsAfter(EXPIRES_AT, 1);

        expect(isExpired(quote, now)).toBe(true);
        expect(repository.confirmQuote(attempt(quote, { now }))).toEqual({ status: "expired" });
        expect(storedConfirmedAt(quote.id)).toBeNull();
      });
    });

    it("rejects a quote read as confirmable once it expires before the write", () => {
      const quote = repository.create(newQuote());
      const fetched = repository.findById(quote.id);
      expect(fetched && isExpired(fetched, CREATED_AT)).toBe(false);

      const result = repository.confirmQuote(
        attempt(quote, { now: millisecondsAfter(EXPIRES_AT, 1) }),
      );

      expect(result).toEqual({ status: "expired" });
      expect(storedConfirmedAt(quote.id)).toBeNull();
    });

    it("keeps reporting 'already_confirmed' after a confirmed quote's window closes", () => {
      const quote = repository.create(newQuote());
      repository.confirmQuote(attempt(quote));

      expect(
        repository.confirmQuote(attempt(quote, { now: millisecondsAfter(EXPIRES_AT, 60_000) })),
      ).toEqual({ status: "already_confirmed" });
    });

    it("reports 'not_owner' for another user's quote without confirming it", () => {
      const quote = repository.create(newQuote());

      expect(repository.confirmQuote(attempt(quote, { userId: otherUserId }))).toEqual({
        status: "not_owner",
      });
      expect(storedConfirmedAt(quote.id)).toBeNull();
      expect(repository.confirmQuote(attempt(quote)).status).toBe("confirmed");
    });

    it("reports 'not_owner' whatever state another user's quote is in", () => {
      const confirmed = repository.create(newQuote());
      repository.confirmQuote(attempt(confirmed));
      const expired = repository.create(newQuote());
      const afterExpiry = millisecondsAfter(EXPIRES_AT, 1);

      expect(repository.confirmQuote(attempt(confirmed, { userId: otherUserId }))).toEqual({
        status: "not_owner",
      });
      expect(
        repository.confirmQuote(attempt(expired, { userId: otherUserId, now: afterExpiry })),
      ).toEqual({ status: "not_owner" });
    });

    it("resolves exactly one of two concurrent confirmations as 'confirmed'", async () => {
      const quote = repository.create(newQuote());

      const results = await Promise.all([
        Promise.resolve().then(() => repository.confirmQuote(attempt(quote))),
        Promise.resolve().then(() => repository.confirmQuote(attempt(quote))),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        "already_confirmed",
        "confirmed",
      ]);
      expect(storedConfirmedAt(quote.id)).not.toBeNull();
    });
  });
});

describe("QuoteRepository across separate database connections", () => {
  let directory: string;
  let connections: Database.Database[];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "quote-repository-"));
    connections = [];
  });

  afterEach(() => {
    for (const connection of connections) {
      connection.close();
    }
    rmSync(directory, { recursive: true, force: true });
  });

  function connect(): Database.Database {
    const connection = new Database(join(directory, "quotes.db"));
    connection.pragma("foreign_keys = ON");
    connections.push(connection);
    return connection;
  }

  it("records one confirmation when two connections both saw the quote unconfirmed", () => {
    // The guarantee has to hold in SQLite, not in one process's objects: each connection reads the
    // quote as confirmable before either writes, so only the UPDATE's guard can stop the second.
    const first = connect();
    runMigrations(first, migrations);
    const { userId } = seedUsersAndCurrency(first);
    const second = connect();
    const firstRepository = new QuoteRepository(first);
    const secondRepository = new QuoteRepository(second);

    const quote = firstRepository.create({
      userId,
      destinationCurrency: "MXN",
      quantity: 10000,
      unitPrice: 314,
      totalPrice: 3144,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });
    expect(firstRepository.findById(quote.id)?.confirmedAt).toBeNull();
    expect(secondRepository.findById(quote.id)?.confirmedAt).toBeNull();

    const confirmAttempt = { quoteId: quote.id, userId, now: CREATED_AT };
    const results = [
      secondRepository.confirmQuote(confirmAttempt),
      firstRepository.confirmQuote(confirmAttempt),
    ];

    expect(results.map((result) => result.status)).toEqual(["confirmed", "already_confirmed"]);
    const { count } = first
      .prepare("SELECT COUNT(*) AS count FROM quotes WHERE confirmed_at IS NOT NULL")
      .get() as { count: number };
    expect(count).toBe(1);
  });
});

function seedUsersAndCurrency(db: Database.Database): { userId: number; otherUserId: number } {
  db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("MXN");
  const insertUser = db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)");
  return {
    userId: Number(insertUser.run("alice", 0).lastInsertRowid),
    otherUserId: Number(insertUser.run("bob", 60).lastInsertRowid),
  };
}
