import { expect, test } from "@playwright/test";
import { createQuote, logIn } from "./support/flows";

// bob belongs to this spec alone, and the run starts from a fresh database, so bob's only quote is
// the one this spec lets expire.
const USERNAME = "bob";

/** A quote is valid for 10 seconds from creation. */
const QUOTE_VALIDITY_MS = 10_000;
/** How far past the validity window the confirmation is sent. */
const EXPIRY_MARGIN_MS = 1_000;

test("confirming a quote after its 10-second validity is rejected and it stays out of the history", async ({
  page,
}) => {
  await logIn(page, USERNAME);
  await createQuote(page, "EUR", "50.00");

  // The backend created the quote before the screen showed it, so its window started before this wait.
  await page.waitForTimeout(QUOTE_VALIDITY_MS + EXPIRY_MARGIN_MS);
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(
    page.getByText("This quote has expired. Create a new quote to get a current price."),
  ).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByText("No confirmed quotes yet.")).toBeVisible();
});
