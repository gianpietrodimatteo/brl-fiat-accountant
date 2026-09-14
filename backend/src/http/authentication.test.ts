import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareDatabase } from "../db/prepareDatabase";
import { createExchangeClients } from "../exchanges/exchangeClients";
import { UserRepository } from "../repositories/UserRepository";
import { authenticate } from "./authentication";
import { buildApp } from "./buildApp";

describe("authenticate", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let handlerCalls: number;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    prepareDatabase(db);
    app = buildApp({ db, exchangeClients: createExchangeClients("simulated") });

    handlerCalls = 0;
    app.post(
      "/test/whoami",
      {
        onRequest: authenticate,
        schema: { body: { type: "object", required: ["ping"] } },
      },
      async (request) => {
        handlerCalls += 1;
        const { id, username, spreadBasisPoints } = request.user;
        return { id, username, spreadBasisPoints };
      },
    );
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  function whoami(authorization?: string) {
    return app.inject({
      method: "POST",
      url: "/test/whoami",
      headers: authorization === undefined ? {} : { authorization },
      payload: { ping: true },
    });
  }

  async function loginToken(username: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { username },
    });
    return response.json().token;
  }

  it.each([
    ["no Authorization header", undefined],
    ["a Basic scheme", "Basic YWxpY2U6"],
    ["a Bearer scheme with an empty token", "Bearer "],
    ["a bare Bearer scheme", "Bearer"],
    ["an unknown token", "Bearer 00000000-0000-4000-8000-000000000000"],
    ["a token with no scheme", "00000000-0000-4000-8000-000000000000"],
  ])("rejects %s with 401 unauthorized", async (_label, authorization) => {
    const response = await whoami(authorization);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
    expect(handlerCalls).toBe(0);
  });

  it("rejects a real token sent under another scheme", async () => {
    const token = await loginToken("alice");

    const response = await whoami(`Basic ${token}`);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("puts the token's user on the request", async () => {
    const alice = new UserRepository(db).findByUsername("alice");
    const bob = new UserRepository(db).findByUsername("bob");
    const aliceToken = await loginToken("alice");
    const bobToken = await loginToken("bob");

    const asAlice = await whoami(`Bearer ${aliceToken}`);
    const asBob = await whoami(`Bearer ${bobToken}`);

    expect(asAlice.statusCode).toBe(200);
    expect(asAlice.json()).toEqual({
      id: alice?.id,
      username: "alice",
      spreadBasisPoints: 0,
    });
    expect(asBob.json()).toEqual({ id: bob?.id, username: "bob", spreadBasisPoints: 60 });
  });

  it("accepts the scheme in any letter case", async () => {
    const token = await loginToken("alice");

    const response = await whoami(`bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ username: "alice" });
  });

  it("rejects an unauthenticated request before validating its body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/test/whoami",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });
});
