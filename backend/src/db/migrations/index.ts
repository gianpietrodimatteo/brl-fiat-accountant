import type { Migration } from "../migrationRunner";
import { migration0001Init } from "./0001_init";
import { migration0002Sessions } from "./0002_sessions";
import { migration0003RescaleQuoteUnitPrice } from "./0003_rescale_quote_unit_price";

export const migrations: Migration[] = [
  migration0001Init,
  migration0002Sessions,
  migration0003RescaleQuoteUnitPrice,
];
