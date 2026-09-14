import { expect, test } from "@playwright/test";

// Every test gets a fresh browser context, so there is no session in sessionStorage.
for (const route of ["/quotation", "/history"]) {
  test(`opening ${route} without a session lands on the login screen`, async ({ page }) => {
    await page.goto(route);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  });
}
