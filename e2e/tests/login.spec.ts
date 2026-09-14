import { expect, test } from "@playwright/test";

test("logging in with a username that isn't seeded shows the error and stays on the login screen", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("mallory");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Unknown username.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});
