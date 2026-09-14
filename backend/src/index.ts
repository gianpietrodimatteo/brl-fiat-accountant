import { openDatabase } from "./db/connection";
import { prepareDatabase } from "./db/prepareDatabase";
import { activeExchangeMode, getExchangeClients } from "./exchanges/exchangeClients";
import { OkxClient } from "./exchanges/OkxClient";
import { buildApp, DEFAULT_CORS_ORIGIN } from "./http/buildApp";

const DEFAULT_PORT = 3001;
/** All interfaces, so the server is reachable from outside its Docker container. */
const HOST = "0.0.0.0";

/** Composition root: the only place that opens resources, and the one that closes them. */
async function main(): Promise<void> {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const corsOrigin = process.env.CORS_ORIGIN || DEFAULT_CORS_ORIGIN;

  const db = openDatabase();
  const exchangeClients = getExchangeClients();
  // Only the live OKX client has a feed to open; the Simulated Mode fake answers from memory.
  const okxFeed = exchangeClients.okx instanceof OkxClient ? exchangeClients.okx : null;
  const app = buildApp({ db, exchangeClients, corsOrigin, logger: true });

  let closing: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      try {
        await app.close();
      } finally {
        okxFeed?.stop();
        db.close();
      }
    })();
    return closing;
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      app.log.info(`${signal} received, shutting down`);
      close().then(
        () => process.exit(0),
        (error: unknown) => {
          app.log.error({ err: error }, "shutdown failed");
          process.exit(1);
        },
      );
    });
  }

  try {
    const applied = prepareDatabase(db);
    app.log.info(
      applied.length === 0
        ? "database up to date, seed checked"
        : `applied migrations: ${applied.join(", ")}; seed checked`,
    );

    okxFeed?.start();

    await app.listen({ port, host: HOST });
    app.log.info(`exchange mode: ${activeExchangeMode}`);
  } catch (error) {
    await close();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error("backend failed to start", error);
  process.exit(1);
});
