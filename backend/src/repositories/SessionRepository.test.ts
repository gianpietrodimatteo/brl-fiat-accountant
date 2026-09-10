import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { SessionRepository } from "./SessionRepository";

describe("SessionRepository", () => {
  let db: Database.Database;
  let repository: SessionRepository;
  let userId: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);
    repository = new SessionRepository(db);

    const userInfo = db
      .prepare("INSERT INTO users (username, spread) VALUES (?, ?)")
      .run("alice", 0);
    userId = Number(userInfo.lastInsertRowid);
  });

  afterEach(() => {
    db.close();
  });

  it("creates a session for a user with a unique token", () => {
    const session = repository.create(userId);

    expect(session).toEqual(
      expect.objectContaining({
        userId,
        token: expect.any(String),
      }),
    );
  });

  it("finds a session by token", () => {
    const created = repository.create(userId);

    const found = repository.findByToken(created.token);

    expect(found).toEqual(created);
  });

  it("returns null when a token does not exist", () => {
    expect(repository.findByToken("nonexistent-token")).toBeNull();
  });

  it("issues a different token for each session", () => {
    const first = repository.create(userId);
    const second = repository.create(userId);

    expect(first.token).not.toBe(second.token);
  });
});
