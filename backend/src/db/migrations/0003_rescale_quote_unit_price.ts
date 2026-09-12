import type { Migration } from "../migrationRunner";

/**
 * Rescales `quotes.unit_price` from BRL centavos to BRL sub-units at 10^8, per DECISIONS.md.
 *
 * A centavo scale can't hold a per-unit rate: 100 MXN at R$31.44 is 0.00314375 BRL per MXN
 * centavo, which would have to be flattened to a whole centavo and would no longer multiply
 * back out to the total. Centavos are 10^2 sub-units, so an existing row scales by 10^6.
 *
 * No DDL change is needed — the column is already `INTEGER` and SQLite's 64-bit range is far
 * wider than anything this can hold — so this is a no-op on a database with no quotes yet.
 */
export const migration0003RescaleQuoteUnitPrice: Migration = {
  name: "0003_rescale_quote_unit_price",
  sql: `
    UPDATE quotes SET unit_price = unit_price * 1000000;
  `,
};
