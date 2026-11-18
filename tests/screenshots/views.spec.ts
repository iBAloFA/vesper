import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const OUTPUT = "docs/screenshots";

test.beforeAll(async () => {
  await mkdir(OUTPUT, { recursive: true });
});

async function settleFonts(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function clearToasts(page: import("@playwright/test").Page): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const close = page.getByRole("button", { name: "Dismiss message" }).first();
    if ((await close.count()) === 0) return;
    await close.click();
  }
}

async function topOfPage(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

test("landing", async ({ page }) => {
  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep a vigil");
  await settleFonts(page);
  await page.screenshot({ path: `${OUTPUT}/landing.png` });
});

test("ritual", async ({ page }) => {
  await page.goto("/#/vigil");
  await page.getByLabel("Name the thing").fill("Finish the opening chapter");
  await page.getByRole("button", { name: "The Hearth" }).click();
  await page.getByRole("button", { name: /Light the candle/ }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await settleFonts(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUTPUT}/ritual.png` });
});

test("return and crypt", async ({ page }) => {
  await page.clock.install();
  await page.goto("/#/vigil");
  await page.getByLabel("Name the thing").fill("Finish the opening chapter");
  await page.getByRole("button", { name: "The Hearth" }).click();
  await page.getByRole("button", { name: /Light the candle/ }).click();
  await page.clock.fastForward(26 * 60_000);

  await expect(page.getByRole("heading", { level: 1, name: "Finish the opening chapter" })).toBeVisible();
  await page.getByRole("button", { name: "Forge a local keeper & seal" }).click();
  await expect(page.getByText("signature verified")).toBeVisible({ timeout: 20_000 });
  await clearToasts(page);
  await topOfPage(page);
  await settleFonts(page);
  await page.screenshot({ path: `${OUTPUT}/return.png` });

  await page.getByRole("button", { name: "Enter the crypt" }).click();
  await expect(page.getByRole("heading", { name: "What the dark kept." })).toBeVisible();
  await page.getByRole("button", { name: "Add samples" }).click();
  await clearToasts(page);
  await topOfPage(page);
  await settleFonts(page);
  await page.screenshot({ path: `${OUTPUT}/crypt.png` });
});
