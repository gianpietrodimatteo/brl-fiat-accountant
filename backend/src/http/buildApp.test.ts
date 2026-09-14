import Database from "better-sqlite3";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareDatabase } from "../db/prepareDatabase";
import { createExchangeClients } from "../exchanges/exchangeClients";
import { UserRepository } from "../repositories/UserRepository";
import { buildApp, DEFAULT_CORS_ORIGIN } from "./buildApp";

const FRONTEND_ORIGIN = "http://frontend.test";
const NOW = new Date("2026-09-13T12:00:00.000Z");

describe("buildApp", () => {
  let db: Database.Database;
  let app: FastifyInstance;
  let fetchSpy: ReturnType<typeof vi.fn>;
  let socketSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Any network access from the app under test is a failure, not a slow test.
    fetchSpy = vi.fn(() => {
      throw new Error("fetch is forbidden in tests");
    });
    socketSpy = vi.fn(() => {
      throw new Error("WebSocket is forbidden in tests");
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("WebSocket", socketSpy);

    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    prepareDatabase(db);

    app = buildApp({
      db,
      exchangeClients: createExchangeClients("simulated"),
      clock: () => NOW,
      corsOrigin: FRONTEND_ORIGIN,
    });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    vi.unstubAllGlobals();
  });

  describe("construction", () => {
    it("is ready to serve through inject without listening or touching the network", async () => {
      await app.ready();

      expect(app.server.listening).toBe(false);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(socketSpy).not.toHaveBeenCalled();
    });

    it("wires the services to the given database, exchange clients and clock", async () => {
      const alice = new UserRepository(db).findByUsername("alice");
      if (!alice) throw new Error("expected alice to be seeded");

      const result = await app.services.quoteService.createQuote({
        userId: alice.id,
        destinationCurrency: "MXN",
        quantity: 10000,
      });

      expect(result).toMatchObject({ status: "created", quote: { createdAt: NOW } });
      expect(app.services.sessionService.login("bob")).toMatchObject({ status: "ok" });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(socketSpy).not.toHaveBeenCalled();
    });
  });

  describe("error response shape", () => {
    it("answers an unknown route with 404 not_found", async () => {
      const response = await app.inject({ method: "GET", url: "/does-not-exist" });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: "not_found", message: expect.any(String) },
      });
    });

    it("answers an unexpected exception with 500 internal_error, leaking neither message nor stack", async () => {
      const secret = "SQLITE_CORRUPT at /data/app.db";
      app.get("/test/boom", async () => {
        throw new Error(secret);
      });

      const response = await app.inject({ method: "GET", url: "/test/boom" });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: { code: "internal_error", message: expect.any(String) },
      });
      expect(response.body).not.toContain(secret);
      expect(response.body).not.toContain("stack");
      expect(response.body).not.toMatch(/\bat .+:\d+:\d+/);
    });

    it("uses the shared shape for Fastify's own client errors", async () => {
      app.post("/test/echo", { bodyLimit: 16 }, async (request) => request.body);

      const malformed = await app.inject({
        method: "POST",
        url: "/test/echo",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      });
      const unsupported = await app.inject({
        method: "POST",
        url: "/test/echo",
        headers: { "content-type": "application/xml" },
        payload: "<quantity/>",
      });
      const oversized = await app.inject({
        method: "POST",
        url: "/test/echo",
        payload: { quantity: 1234567890123 },
      });

      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toEqual({
        error: { code: "bad_request", message: expect.any(String) },
      });
      expect(unsupported.statusCode).toBe(415);
      expect(unsupported.json()).toEqual({
        error: { code: "unsupported_media_type", message: expect.any(String) },
      });
      expect(oversized.statusCode).toBe(413);
      expect(oversized.json()).toEqual({
        error: { code: "payload_too_large", message: expect.any(String) },
      });
    });
  });

  describe("schema validation", () => {
    beforeEach(() => {
      app.post(
        "/test/quantity",
        {
          schema: {
            body: {
              type: "object",
              required: ["quantity"],
              properties: { quantity: { type: "integer" } },
            },
          },
        },
        async (request) => {
          const { quantity } = request.body as { quantity: unknown };
          return { quantity, type: typeof quantity };
        },
      );
    });

    it("accepts a well-typed body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/test/quantity",
        payload: { quantity: 10000 },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ quantity: 10000, type: "number" });
    });

    it("rejects a numeric string for an integer body field instead of coercing it", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/test/quantity",
        payload: { quantity: "10000" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: "validation_error", message: expect.any(String) },
      });
    });

    it.each([
      ["a fraction", { quantity: 100.5 }],
      ["a boolean", { quantity: true }],
      ["a missing field", {}],
    ])("rejects %s with 400 validation_error", async (_label, payload) => {
      const response = await app.inject({ method: "POST", url: "/test/quantity", payload });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "validation_error" } });
    });

    it("still reads integer route params, which only ever arrive as strings", async () => {
      app.get(
        "/test/items/:id",
        {
          schema: {
            params: {
              type: "object",
              properties: { id: { type: "integer", minimum: 1 } },
            },
          },
        },
        async (request) => {
          const { id } = request.params as { id: unknown };
          return { id, type: typeof id };
        },
      );

      const valid = await app.inject({ method: "GET", url: "/test/items/5" });
      const invalid = await app.inject({ method: "GET", url: "/test/items/abc" });

      expect(valid.statusCode).toBe(200);
      expect(valid.json()).toEqual({ id: 5, type: "number" });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ error: { code: "validation_error" } });
    });
  });

  describe("CORS", () => {
    function preflight(target: FastifyInstance, origin: string) {
      return target.inject({
        method: "OPTIONS",
        url: "/api/quotes",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization, content-type",
        },
      });
    }

    it("allows a preflight from the configured origin that asks to send Authorization", async () => {
      const response = await preflight(app, FRONTEND_ORIGIN);

      expect(response.statusCode).toBe(204);
      expect(response.headers["access-control-allow-origin"]).toBe(FRONTEND_ORIGIN);
      expect(String(response.headers["access-control-allow-headers"]).toLowerCase()).toContain(
        "authorization",
      );
      expect(String(response.headers["access-control-allow-methods"])).toContain("POST");
    });

    it("gives any other origin no Access-Control-Allow-Origin", async () => {
      const response = await preflight(app, "http://evil.test");

      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("allows the local frontend when no origin is configured", async () => {
      const defaultApp = buildApp({ db, exchangeClients: createExchangeClients("simulated") });
      try {
        const response = await preflight(defaultApp, DEFAULT_CORS_ORIGIN);

        expect(response.headers["access-control-allow-origin"]).toBe(DEFAULT_CORS_ORIGIN);
      } finally {
        await defaultApp.close();
      }
    });
  });
});
