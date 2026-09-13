import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { QuoteRepository, type NewQuote } from "./QuoteRepository";

describe("QuoteRepository", () => {
  let db: Database.Database;
  let repository: QuoteRepository;
  let userId: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);
    repository = new QuoteRepository(db);

    db.prepare("INSERT INTO supported_currencies (code) VALUES (?)").run("MXN");
    const userInfo = db
      .prepare("INSERT INTO users (username, spread) VALUES (?, ?)")
      .run("alice", 0);
    userId = Number(userInfo.lastInsertRowid);
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
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10_000),
      ...overrides,
    };
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
    const createdAt = new Date("2026-09-12T10:00:00.000Z");
    const expiresAt = new Date("2026-09-12T10:00:10.000Z");

    const created = repository.create(newQuote({ createdAt, expiresAt }));

    const row = db
      .prepare("SELECT created_at, expires_at FROM quotes WHERE id = ?")
      .get(created.id) as { created_at: string; expires_at: string };
    expect(row).toEqual({
      created_at: "2026-09-12T10:00:00.000Z",
      expires_at: "2026-09-12T10:00:10.000Z",
    });
    expect(created.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it("returns null when a quote id does not exist", () => {
    expect(repository.findById(999)).toBeNull();
  });

  it("lists only confirmed quotes for a user, for history", () => {
    const confirmed = repository.create(newQuote());
    repository.create(newQuote());

    repository.confirmQuote(confirmed.id);

    const history = repository.listConfirmedForUser(userId);

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(confirmed.id);
    expect(history[0].confirmedAt).not.toBeNull();
  });

  it("reports 'not_found' when confirming a non-existent quote", () => {
    expect(repository.confirmQuote(999)).toBe("not_found");
  });

  it("confirms an unconfirmed quote exactly once", () => {
    const quote = repository.create(newQuote());

    expect(repository.confirmQuote(quote.id)).toBe("confirmed");
    expect(repository.confirmQuote(quote.id)).toBe("already_confirmed");
  });

  it("resolves exactly one of two concurrent confirmations as 'confirmed'", async () => {
    const quote = repository.create(newQuote());

    const [first, second] = await Promise.all([
      Promise.resolve().then(() => repository.confirmQuote(quote.id)),
      Promise.resolve().then(() => repository.confirmQuote(quote.id)),
    ]);

    const results = [first, second].sort();
    expect(results).toEqual(["already_confirmed", "confirmed"]);

    const stored = repository.findById(quote.id);
    expect(stored?.confirmedAt).not.toBeNull();
  });
});
