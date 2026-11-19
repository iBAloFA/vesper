import { expect, test } from "@playwright/test";

test("shows the ledger page and its empty file honestly", async ({ page }) => {
  await page.goto("/#/ledger");

  await expect(page.getByRole("heading", { name: "Releases" })).toBeVisible();
  await expect(page.getByText("No release is recorded in this build.")).toBeVisible();
  await expect(page.getByText("no program configured")).toBeVisible();
  await expect(page.getByRole("link", { name: "The ledger" })).toBeVisible();
  await expect(page.getByText("a signed notice, not proof")).toBeVisible();
});
