import AjvCompiler, { type BuildCompilerFromPool, type Options } from "@fastify/ajv-compiler";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance, type FastifySchemaCompiler } from "fastify";
import {
  createServices,
  type ServiceDependencies,
  type Services,
} from "../services/createServices";
import { registerErrorHandling } from "./errors";

export const DEFAULT_CORS_ORIGIN = "http://localhost:3000";

export interface AppDependencies extends ServiceDependencies {
  /** The single frontend origin allowed to call the API cross-origin. */
  corsOrigin?: string;
  /** Request logging; off unless asked for, so tests stay quiet. */
  logger?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    services: Services;
  }
}

/**
 * Builds the HTTP app over already-constructed dependencies, without listening. The process entry
 * point opens and prepares the database and picks the exchange clients; tests hand in an in-memory
 * database and the Simulated Mode fakes and drive it with `app.inject()`.
 */
export function buildApp({
  corsOrigin = DEFAULT_CORS_ORIGIN,
  logger = false,
  ...serviceDependencies
}: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger,
    schemaController: { compilersFactory: { buildValidator: buildBodyStrictValidator } },
  });

  app.decorate("services", createServices(serviceDependencies));

  registerErrorHandling(app);

  // An array, not a string: @fastify/cors echoes a string origin to every caller, while an
  // array only answers the origins in it.
  app.register(cors, {
    origin: [corsOrigin],
    allowedHeaders: ["Authorization", "Content-Type"],
  });

  return app;
}

type RouteValidatorCompiler = FastifySchemaCompiler<unknown>;

const buildValidatorFromPool = AjvCompiler();

/**
 * Fastify's own Ajv setup, with one change: JSON bodies are validated without type coercion, so a
 * `"10000"` sent for an integer field is rejected rather than quietly turned into `10000`.
 *
 * Route params and querystrings keep Fastify's default coercion. They only ever arrive as
 * strings, so an `:id` declared as an integer could never validate without it.
 */
const buildBodyStrictValidator = ((
  externalSchemas: Parameters<typeof buildValidatorFromPool>[0],
  options: { customOptions?: Options },
) => {
  // @fastify/ajv-compiler types its compilers as `(schema) => validate`, but Fastify calls them
  // with the route definition (`{ schema, method, url, httpPart }`), which is what they read.
  const coercing = buildValidatorFromPool(
    externalSchemas,
    options,
  ) as unknown as RouteValidatorCompiler;
  const strict = buildValidatorFromPool(externalSchemas, {
    ...options,
    customOptions: { ...options.customOptions, coerceTypes: false },
  }) as unknown as RouteValidatorCompiler;

  const compileForRoute: RouteValidatorCompiler = (route) =>
    route.httpPart === "body" ? strict(route) : coercing(route);
  return compileForRoute;
}) as unknown as BuildCompilerFromPool;
