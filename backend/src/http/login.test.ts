import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareDatabase } from "../db/prepareDatabase";
import { createExchangeClients } from "../exchanges/exchangeClients";
import { UserRepository } from "../repositories/UserRepository";
import { buildApp } from "./buildApp";
import { loginBodySchema, loginResponseSchema } from "./login";

describe("POST /api/login", () => {
  let db: Database.Database;
  let app: FastifyInstance;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    prepareDatabase(db);
    app = buildApp({ db, exchangeClients: createExchangeClients("simulated") });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function login(payload?: unknown) {
    return app.inject({
      method: "POST",
      url: "/api/login",
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  }

  function sessionCount(): number {
    const row = db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    return row.count;
  }

  function sessionTokensFor(username: string): string[] {
    const user = new UserRepository(db).findByUsername(username);
    if (!user) throw new Error(`expected ${username} to be seeded`);
    const rows = db.prepare("SELECT token FROM sessions WHERE user_id = ?").all(user.id) as {
      token: string;
    }[];
    return rows.map((row) => row.token);
  }

  it("logs in a seeded user, returning a token backed by a new session row", async () => {
    const response = await login({ username: "alice" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({ token: expect.any(String), user: { username: "alice" } });
    expect(body.token).not.toBe("");
    expect(sessionTokensFor("alice")).toEqual([body.token]);
  });

  it("issues a different token on each login, and both authenticate", async () => {
    const first = (await login({ username: "alice" })).json();
    const second = (await login({ username: "alice" })).json();

    expect(first.token).not.toBe(second.token);
    for (const { token } of [first, second]) {
      expect(app.services.sessionService.getUserForSession(token)).toMatchObject({
        status: "ok",
        user: { username: "alice" },
      });
    }
  });

  it("rejects an unknown username with 401 invalid_username and creates no session", async () => {
    const response = await login({ username: "mallory" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "invalid_username", message: expect.any(String) },
    });
    expect(sessionCount()).toBe(0);
  });

  it.each([
    ["a missing body", undefined],
    ["a missing username", {}],
    ["an empty username", { username: "" }],
    ["a non-string username", { username: 123 }],
    ["an extra property", { username: "alice", role: "admin" }],
    ["a password field", { username: "alice", password: "secret" }],
  ])("rejects %s with 400 validation_error", async (_label, payload) => {
    const response = await login(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "validation_error", message: expect.any(String) },
    });
    expect(sessionCount()).toBe(0);
  });

  it("has no password field in its request or response schema", () => {
    expect(JSON.stringify(loginBodySchema).toLowerCase()).not.toContain("password");
    expect(JSON.stringify(loginResponseSchema).toLowerCase()).not.toContain("password");
  });
});
