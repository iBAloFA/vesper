import { expect, test } from "@playwright/test";

test("shows the ledger page and its shipped releases honestly", async ({ page }) => {
  await page.goto("/#/ledger");

  await expect(page.getByRole("heading", { name: "Releases" })).toBeVisible();
  await expect(page.getByText("a signed notice, not proof")).toBeVisible();
  await expect(page.getByText("no program configured")).toBeVisible();
  await expect(page.getByRole("link", { name: "The ledger" })).toBeVisible();

  const releases = page.locator(".ledger-list__item");
  await expect(releases).toHaveCount(2);
  await expect(releases.first()).toContainText("#1");
  await expect(releases.last()).toContainText("#2");
  await expect(releases.first()).toContainText("keeper");
});
