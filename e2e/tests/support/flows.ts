import { expect, type Page } from "@playwright/test";

/** A quote's fields exactly as the quotation screen displays them. */
export interface DisplayedQuote {
  currency: string;
  quantity: string;
  totalPrice: string;
}

/** Logs in through the login screen and waits for the redirect to the quotation screen. */
export async function logIn(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/quotation$/);
}

/** Creates a quote on the quotation screen and returns what the screen shows for it. */
export async function createQuote(
  page: Page,
  currency: string,
  quantity: string,
): Promise<DisplayedQuote> {
  // The select stays disabled until the currencies load, and selectOption waits for it.
  await page.getByLabel("Currency").selectOption(currency);
  await page.getByLabel("Quantity").fill(quantity);
  await page.getByRole("button", { name: "Create quote" }).click();

  const quote = page.getByRole("region", { name: "Quote" });
  await expect(quote).toBeVisible();
  const field = (label: string) =>
    quote.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");

  return {
    currency: await field("Currency").innerText(),
    quantity: await field("Quantity").innerText(),
    totalPrice: await field("Total price").innerText(),
  };
}
