import { expect, test } from "@playwright/test";

test("keeps the v0.1 build at /v1/ with a way back", async ({ page }) => {
  await page.goto("/v1/");

  const badge = page.getByRole("link", { name: "Open the current version of Vesper" });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("href", "../");

  // v0.1 predates the Solana proof layer, so it advertises EIP-712 alone.
  await expect(page.getByText("EIP-712 verifiable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changed in 0.2." })).toHaveCount(0);

  await badge.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "What changed in 0.2." })).toBeVisible();
});

test("keeps the archive's vault separate from the current one", async ({ page }) => {
  await page.goto("/");
  const currentKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(currentKeys).toContain("vesper.vault.v1");
  expect(currentKeys).not.toContain("vesper.vault.v1.archive");

  await page.goto("/v1/");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain("vesper.vault.v1.archive");
});

test("links to the archive from the landing page and the footer", async ({ page }) => {
  await page.goto("/");

  const footerLink = page.getByRole("link", { name: "v0.1 archive", exact: true });
  await expect(footerLink).toHaveAttribute("href", "./v1/");

  const archiveButton = page.getByRole("link", { name: "Open the v0.1 archive" });
  await expect(archiveButton).toBeVisible();
  await expect(archiveButton).toHaveAttribute("href", "./v1/");

  await expect(page.getByText("v0.2.0")).toBeVisible();
});
