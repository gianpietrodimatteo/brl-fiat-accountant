import type { FastifyInstance } from "fastify";

export const currenciesResponseSchema = {
  type: "object",
  required: ["currencies"],
  properties: {
    currencies: {
      type: "array",
      items: {
        type: "object",
        required: ["code", "name"],
        properties: {
          code: { type: "string" },
          name: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/** Not user-specific, so no authentication. The list is always read from the database. */
export function registerCurrenciesRoute(app: FastifyInstance): void {
  app.get(
    "/api/currencies",
    { schema: { response: { 200: currenciesResponseSchema } } },
    async () => {
      const currencies = app.services.quoteService.listSupportedCurrencies();
      return { currencies: currencies.map(({ code, name }) => ({ code, name })) };
    },
  );
}
