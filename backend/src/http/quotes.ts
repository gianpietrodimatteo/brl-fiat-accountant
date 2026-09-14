import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  centavosFromBrl,
  destinationMinorUnitsFromUnits,
  unitPriceSubUnitsFromBrl,
} from "../domain/money";
import type { Quote } from "../domain/Quote";
import type { ConfirmQuoteResult, CreateQuoteResult, HistoryEntry } from "../services/QuoteService";
import { authenticate } from "./authentication";
import { errorResponse } from "./errors";

interface CreateQuoteBody {
  destinationCurrency: string;
  /** Destination-currency minor units: 100 MXN is `10000`. */
  quantity: number;
}

/**
 * Only the shape is checked here. Whether the quantity is positive and whether the currency is
 * quotable are `QuoteService`'s calls, so a well-typed `0` or `"mxn"` gets its own error code
 * rather than `validation_error`.
 */
export const createQuoteBodySchema = {
  type: "object",
  required: ["destinationCurrency", "quantity"],
  properties: {
    destinationCurrency: { type: "string" },
    quantity: { type: "integer" },
  },
  additionalProperties: false,
} as const;

/**
 * A quote on the wire. Every amount is the integer stored in its column, sent as-is: JSON
 * integers are exact because Epic 4 caps each stored amount at 2^53 − 1 (see DECISIONS.md).
 */
export interface QuoteResponse {
  id: number;
  destinationCurrency: string;
  /** Integer destination-currency minor units: 100 MXN is `10000`. */
  quantity: number;
  /** Integer BRL sub-units at 10^8 per destination minor unit: R$0.00314375 is `314375`. */
  unitPrice: number;
  /** Integer BRL centavos: R$31.44 is `3144`. */
  totalPrice: number;
  /** ISO 8601 UTC. */
  createdAt: string;
  /** ISO 8601 UTC; the quote is still valid at exactly this instant. */
  expiresAt: string;
}

export const quoteResponseSchema = {
  type: "object",
  required: [
    "id",
    "destinationCurrency",
    "quantity",
    "unitPrice",
    "totalPrice",
    "createdAt",
    "expiresAt",
  ],
  properties: {
    id: { type: "integer" },
    destinationCurrency: { type: "string" },
    quantity: { type: "integer", description: "Destination-currency minor units" },
    unitPrice: {
      type: "integer",
      description: "BRL sub-units at 10^8 per destination-currency minor unit",
    },
    totalPrice: { type: "integer", description: "BRL centavos" },
    createdAt: { type: "string", format: "date-time", description: "ISO 8601 UTC" },
    expiresAt: { type: "string", format: "date-time", description: "ISO 8601 UTC" },
  },
} as const;

const createQuoteResponseSchema = {
  type: "object",
  required: ["quote"],
  properties: { quote: quoteResponseSchema },
} as const;

/** The stored values, unchanged: no arithmetic, only field names and timestamp formatting. */
export function toQuoteResponse(quote: Quote): QuoteResponse {
  return {
    id: quote.id,
    destinationCurrency: quote.destinationCurrency,
    quantity: quote.quantity,
    unitPrice: quote.unitPrice,
    totalPrice: quote.totalPrice,
    createdAt: quote.createdAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
  };
}

interface QuoteIdParams {
  id: number;
}

/**
 * Params arrive as text and are coerced to the declared type, so `abc`, `0`, `-3` and `1.5` all
 * fail here with `validation_error`.
 */
export const quoteIdParamsSchema = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "integer", minimum: 1 } },
} as const;

/** A confirmed quote on the wire: `QuoteResponse` plus the instant it was confirmed. */
export interface ConfirmedQuoteResponse extends QuoteResponse {
  /** ISO 8601 UTC. */
  confirmedAt: string;
}

const confirmedAtSchema = {
  type: "string",
  format: "date-time",
  description: "ISO 8601 UTC",
} as const;

const confirmQuoteResponseSchema = {
  type: "object",
  required: ["quote"],
  properties: {
    quote: {
      ...quoteResponseSchema,
      required: [...quoteResponseSchema.required, "confirmedAt"],
      properties: { ...quoteResponseSchema.properties, confirmedAt: confirmedAtSchema },
    },
  },
} as const;

/** A confirmed quote as history lists it, in the same units and field names as `QuoteResponse`. */
export interface HistoryItem {
  id: number;
  destinationCurrency: string;
  /** Integer destination-currency minor units. */
  quantity: number;
  /** Integer BRL sub-units at 10^8 per destination-currency minor unit. */
  unitPrice: number;
  /** Integer BRL centavos. */
  totalPrice: number;
  /** ISO 8601 UTC. */
  createdAt: string;
  /** ISO 8601 UTC. */
  confirmedAt: string;
}

const quoteFields = quoteResponseSchema.properties;

/** Only these fields are serialized, so history can never carry a total or anything else. */
const historyResponseSchema = {
  type: "object",
  required: ["quotes"],
  properties: {
    quotes: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "destinationCurrency",
          "quantity",
          "unitPrice",
          "totalPrice",
          "createdAt",
          "confirmedAt",
        ],
        properties: {
          id: quoteFields.id,
          destinationCurrency: quoteFields.destinationCurrency,
          quantity: quoteFields.quantity,
          unitPrice: quoteFields.unitPrice,
          totalPrice: quoteFields.totalPrice,
          createdAt: quoteFields.createdAt,
          confirmedAt: confirmedAtSchema,
        },
      },
    },
  },
} as const;

export function toConfirmedQuoteResponse(quote: Quote): ConfirmedQuoteResponse {
  if (!quote.confirmedAt) {
    throw new Error(`Quote ${quote.id} was reported confirmed without a confirmedAt`);
  }
  return { ...toQuoteResponse(quote), confirmedAt: quote.confirmedAt.toISOString() };
}

/**
 * History's exact decimals read back into the integer counts they were stored as, through
 * `money.ts`'s inverses: each rejects a value that isn't a whole count rather than rounding it,
 * so what is sent is the stored column or nothing.
 */
export function toHistoryItem(entry: HistoryEntry): HistoryItem {
  return {
    id: entry.id,
    destinationCurrency: entry.destinationCurrency,
    quantity: destinationMinorUnitsFromUnits(entry.quantity),
    unitPrice: unitPriceSubUnitsFromBrl(entry.unitPrice),
    totalPrice: centavosFromBrl(entry.totalPrice),
    createdAt: entry.createdAt.toISOString(),
    confirmedAt: entry.confirmedAt.toISOString(),
  };
}

export function registerQuoteRoutes(app: FastifyInstance): void {
  app.post<{ Body: CreateQuoteBody }>(
    "/api/quotes",
    {
      onRequest: authenticate,
      schema: { body: createQuoteBodySchema, response: { 201: createQuoteResponseSchema } },
    },
    async (request, reply) => {
      const result = await app.services.quoteService.createQuote({
        // Always the token's user: the body has no say in whose spread is applied.
        userId: request.user.id,
        destinationCurrency: request.body.destinationCurrency,
        quantity: request.body.quantity,
      });
      return replyToCreateQuote(request, reply, result);
    },
  );

  app.post<{ Params: QuoteIdParams }>(
    "/api/quotes/:id/confirm",
    {
      onRequest: authenticate,
      schema: { params: quoteIdParamsSchema, response: { 200: confirmQuoteResponseSchema } },
    },
    async (request, reply) => {
      // Ownership, the exactly-once guard and expiry are all the service's single write: nothing
      // is checked here first, so no check can go stale before it lands.
      const result = app.services.quoteService.confirmQuote({
        userId: request.user.id,
        quoteId: request.params.id,
      });
      return replyToConfirmQuote(reply, result);
    },
  );

  app.get(
    "/api/quotes/history",
    { onRequest: authenticate, schema: { response: { 200: historyResponseSchema } } },
    async (request) => {
      const history = app.services.quoteService.listHistory(request.user.id);
      return { quotes: history.map(toHistoryItem) };
    },
  );
}

function replyToConfirmQuote(reply: FastifyReply, result: ConfirmQuoteResult): FastifyReply {
  switch (result.status) {
    case "confirmed":
      return reply.status(200).send({ quote: toConfirmedQuoteResponse(result.quote) });
    case "expired":
      return reply.status(410).send(errorResponse("quote_expired", "The quote has expired"));
    case "already_confirmed":
      return reply
        .status(409)
        .send(errorResponse("quote_already_confirmed", "The quote is already confirmed"));
    case "not_found":
    case "not_owner":
      // One response for both, so another user's quote ids can't be told apart from unused ones.
      return reply.status(404).send(errorResponse("quote_not_found", "Quote not found"));
    default: {
      const unhandled: never = result;
      throw new Error(`Unhandled confirm-quote result: ${JSON.stringify(unhandled)}`);
    }
  }
}

function replyToCreateQuote(
  request: FastifyRequest,
  reply: FastifyReply,
  result: CreateQuoteResult,
): FastifyReply {
  switch (result.status) {
    case "created":
      return reply.status(201).send({ quote: toQuoteResponse(result.quote) });
    case "invalid_quantity":
      return reply
        .status(400)
        .send(errorResponse("invalid_quantity", "quantity must be a positive integer"));
    case "unsupported_currency":
      return reply
        .status(400)
        .send(errorResponse("unsupported_currency", "destinationCurrency is not supported"));
    case "quantity_too_large":
      return reply.status(422).send(
        errorResponse("quantity_too_large", "quantity is too large to quote", {
          maxQuantity: result.maxQuantity,
        }),
      );
    case "no_quote_capability":
      // The reason names exchanges and pairs: useful in the log, not something to show a client.
      request.log.warn({ reason: result.reason }, "no quote capability");
      return reply
        .status(503)
        .send(
          errorResponse("no_quote_capability", "Quotes are temporarily unavailable, try again"),
        );
    case "unknown_user":
      return reply
        .status(401)
        .send(errorResponse("unauthorized", "A valid bearer token is required"));
    default: {
      const unhandled: never = result;
      throw new Error(`Unhandled create-quote result: ${JSON.stringify(unhandled)}`);
    }
  }
}
