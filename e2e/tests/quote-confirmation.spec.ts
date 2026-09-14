import { expect, test } from "@playwright/test";
import { createQuote, logIn } from "./support/flows";

// alice belongs to this spec alone, so no other spec adds to the history asserted here.
const USERNAME = "alice";

test("a confirmed quote tops the history with the amounts the quotation screen showed", async ({
  page,
}) => {
  await logIn(page, USERNAME);
  const shown = await createQuote(page, "MXN", "100.00");
  expect(shown).toMatchObject({ currency: "MXN", quantity: "100.00" });

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/^Quote confirmed at /)).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);

  const rows = page.locator("tbody tr");
  // The run starts from a fresh database, so the quote just confirmed is the only one.
  await expect(rows).toHaveCount(1);
  const cells = rows.first().getByRole("cell");
  await expect(cells.nth(0)).toHaveText(shown.currency);
  await expect(cells.nth(1)).toHaveText(shown.quantity);
  await expect(cells.nth(3)).toHaveText(shown.totalPrice);
});
