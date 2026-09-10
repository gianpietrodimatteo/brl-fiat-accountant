import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import { UserRepository } from "./UserRepository";

describe("UserRepository", () => {
  let db: Database.Database;
  let repository: UserRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db, migrations);
    repository = new UserRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("finds a user by id", () => {
    const info = db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)").run("alice", 0);

    const user = repository.findById(Number(info.lastInsertRowid));

    expect(user).toEqual(expect.objectContaining({ username: "alice", spreadBasisPoints: 0 }));
  });

  it("returns null when a user id does not exist", () => {
    expect(repository.findById(999)).toBeNull();
  });

  it("finds a user by username", () => {
    db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)").run("bob", 60);

    const user = repository.findByUsername("bob");

    expect(user).toEqual(expect.objectContaining({ username: "bob", spreadBasisPoints: 60 }));
  });

  it("returns null when a username does not exist", () => {
    expect(repository.findByUsername("nobody")).toBeNull();
  });

  it("lists all users", () => {
    db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)").run("alice", 0);
    db.prepare("INSERT INTO users (username, spread) VALUES (?, ?)").run("bob", 60);

    const users = repository.listAll();

    expect(users.map((u) => u.username).sort()).toEqual(["alice", "bob"]);
  });
});
