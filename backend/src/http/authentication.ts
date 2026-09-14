import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { User } from "../domain/User";
import { errorResponse } from "./errors";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The caller, resolved from the bearer token. Only set on routes that opt in to
     * `authenticate`; anywhere else it is `null` at runtime.
     */
    user: User;
  }
}

/** Case-insensitive scheme (RFC 7235), then exactly one non-empty token. */
const BEARER_HEADER = /^Bearer +(\S+)$/i;

/** Declares `request.user` once, so Fastify keeps every request object the same shape. */
export function registerAuthentication(app: FastifyInstance): void {
  // Typed as `User` so handlers behind `authenticate` need no null check; see the declaration.
  app.decorateRequest("user", null as unknown as User);
}

/**
 * The one authentication step for protected routes, used as their `onRequest` hook: turns
 * `Authorization: Bearer <token>` into `request.user`, or answers `401 unauthorized`. Running at
 * `onRequest` rejects an unauthenticated caller before its body is parsed or validated.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const match = BEARER_HEADER.exec(request.headers.authorization?.trim() ?? "");
  const result = match
    ? request.server.services.sessionService.getUserForSession(match[1])
    : { status: "not_found" as const };

  if (result.status !== "ok") {
    return reply
      .status(401)
      .send(errorResponse("unauthorized", "A valid bearer token is required"));
  }

  request.user = result.user;
}
