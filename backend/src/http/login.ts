import type { FastifyInstance } from "fastify";
import { errorResponse } from "./errors";

interface LoginBody {
  username: string;
}

/** Username only: no password, registration or recovery, by design. */
export const loginBodySchema = {
  type: "object",
  required: ["username"],
  properties: { username: { type: "string", minLength: 1 } },
  additionalProperties: false,
} as const;

export const loginResponseSchema = {
  type: "object",
  required: ["token", "user"],
  properties: {
    token: { type: "string" },
    user: {
      type: "object",
      required: ["username"],
      properties: { username: { type: "string" } },
    },
  },
} as const;

export function registerLoginRoute(app: FastifyInstance): void {
  app.post<{ Body: LoginBody }>(
    "/api/login",
    { schema: { body: loginBodySchema, response: { 200: loginResponseSchema } } },
    async (request, reply) => {
      const result = app.services.sessionService.login(request.body.username);

      if (result.status === "user_not_found") {
        return reply.status(401).send(errorResponse("invalid_username", "Unknown username"));
      }

      return { token: result.session.token, user: { username: request.body.username } };
    },
  );
}
