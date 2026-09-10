import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { UserRepository } from "../repositories/UserRepository";
import { SessionRepository } from "../repositories/SessionRepository";
import { SessionService } from "./SessionService";

describe("SessionService", () => {
  let db: Database.Database;
  let service: SessionService;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);

    const userRepository = new UserRepository(db);
    const sessionRepository = new SessionRepository(db);
    service = new SessionService(userRepository, sessionRepository);

    userRepository.insertIfNotExists("alice", 0);
  });

  afterEach(() => {
    db.close();
  });

  it("logs in an existing user, creating a session linked to them", () => {
    const user = new UserRepository(db).findByUsername("alice");

    const result = service.login("alice");

    expect(result).toEqual(
      expect.objectContaining({
        status: "ok",
        session: expect.objectContaining({ userId: user?.id }),
      }),
    );
  });

  it("returns a typed failure when logging in with an unknown username", () => {
    const result = service.login("nonexistent");

    expect(result).toEqual({ status: "user_not_found" });
  });

  it("resolves a valid session token back to its user", () => {
    const loginResult = service.login("alice");
    if (loginResult.status !== "ok") throw new Error("expected login to succeed");

    const result = service.getUserForSession(loginResult.session.token);

    expect(result).toEqual(
      expect.objectContaining({
        status: "ok",
        user: expect.objectContaining({ username: "alice" }),
      }),
    );
  });

  it("returns a typed failure for an unknown or malformed token", () => {
    expect(service.getUserForSession("not-a-real-token")).toEqual({ status: "not_found" });
  });
});
