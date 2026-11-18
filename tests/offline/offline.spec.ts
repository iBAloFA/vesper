import { expect, test } from "@playwright/test";

test("the built app reloads offline from its service worker", async ({ page, context }) => {
  await page.goto("/#/crypt");
  await expect(page.getByRole("heading", { name: "Nothing has been kept here yet." })).toBeVisible();

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Nothing has been kept here yet." })).toBeVisible();

  await context.setOffline(true);
  await page.reload();

  await expect(page).toHaveTitle(/Vesper/);
  await expect(page.getByRole("heading", { name: "Nothing has been kept here yet." })).toBeVisible();
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");

  await context.setOffline(false);
});
