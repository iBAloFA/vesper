import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.setTimeout(180_000);

test("solana walkthrough", async ({ page, context }) => {
  await mkdir("demo-artifacts", { recursive: true });
  await page.clock.install();

  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep a vigil");
  await page.waitForTimeout(2000);

  await page.getByRole("button", { name: "Begin a vigil" }).click();
  await page.waitForTimeout(500);
  await page.getByLabel("Name the thing").fill("Read the whole letter");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByLabel("Minutes").fill("1");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "The Hearth" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Light the candle/ }).click();

  await expect(page.getByRole("timer")).toBeVisible();
  await page.waitForTimeout(2200);

  await page.clock.fastForward(62_000);
  await expect(
    page.getByRole("heading", { level: 1, name: "Read the whole letter" }),
  ).toBeVisible();
  await page.waitForTimeout(1600);

  const panel = page.getByRole("region", { name: "Solana seal" });
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  await page.locator("#solana-passphrase").fill("quiet keeper 42");
  await page.waitForTimeout(300);
  await page.locator("#solana-passphrase-repeat").fill("quiet keeper 42");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Forge a keeper" }).click();
  await expect(page.getByRole("button", { name: "Seal with the local keeper" })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "Lock keeper" }).click();
  const unlockField = page.locator("#solana-unlock");
  await expect(unlockField).toBeVisible();
  await page.waitForTimeout(900);
  await unlockField.fill("quiet keeper 42");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Unlock keeper" }).click();
  await expect(page.getByText("The keeper is open for this visit.")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Seal with the local keeper" }).click();
  await expect(panel.getByText("signature verified")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1800);

  await panel.locator(".facts").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);

  await page.getByRole("button", { name: "Enter the crypt" }).click();
  await expect(page.getByRole("heading", { name: "What the dark kept." })).toBeVisible();
  const row = page.locator(".ledger__row").filter({ hasText: "Read the whole letter" });
  await expect(row).toBeVisible();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);

  await page.locator(".constellation").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);

  const video = page.video();
  if (!video) throw new Error("Playwright did not record a video.");
  await context.close();
  await video.saveAs("demo-artifacts/vesper-solana.webm");
  console.log(`saved ${await video.path()}`);
});
