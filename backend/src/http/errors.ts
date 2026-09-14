import { STATUS_CODES } from "node:http";
import type { FastifyError, FastifyInstance } from "fastify";

/**
 * The one body every non-2xx response carries. An error may add its own machine-readable fields
 * next to `code` and `message` (e.g. `maxQuantity`), but never replaces or renames them.
 */
export interface ErrorResponse<Details extends object = object> {
  error: {
    /** Stable, snake_case, for clients to branch on. */
    code: string;
    /** Human-readable; never a stack trace or an internal error's message. */
    message: string;
  } & Details;
}

export function errorResponse<Details extends object = object>(
  code: string,
  message: string,
  details?: Details,
): ErrorResponse<Details> {
  return { error: { ...details, code, message } as ErrorResponse<Details>["error"] };
}

const INTERNAL_ERROR_MESSAGE = "An unexpected error occurred";

/**
 * Routes every failure through the shared error shape: schema-validation failures, Fastify's own
 * client errors (malformed JSON, unsupported media type, oversized body), unknown routes, and
 * anything a handler throws unexpectedly.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.status(400).send(errorResponse("validation_error", error.message));
    }

    // Client errors raised by Fastify itself describe the request, not our internals, so their
    // status and message are safe to pass on.
    const { statusCode } = error;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send(errorResponse(codeForStatus(statusCode), error.message));
    }

    // Anything else is our fault. Keep the detail in the log and out of the response.
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send(errorResponse("internal_error", INTERNAL_ERROR_MESSAGE));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(errorResponse("not_found", "Route not found"));
  });
}

/** `413` → `payload_too_large`, from Node's own status text. */
function codeForStatus(statusCode: number): string {
  const text = STATUS_CODES[statusCode];
  if (text === undefined) {
    return "client_error";
  }
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}
