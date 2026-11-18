import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("walkthrough", async ({ page, context }) => {
  await mkdir("demo-artifacts", { recursive: true });
  await page.clock.install();

  await page.goto("/#/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep a vigil");
  await page.waitForTimeout(2600);

  await page.getByRole("button", { name: "Begin a vigil" }).click();
  await page.waitForTimeout(1000);

  await page.getByLabel("Name the thing").fill("Finish the opening chapter");
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByLabel("Minutes").fill("1");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "The Hearth" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Light the candle/ }).click();

  await expect(page.getByRole("timer")).toBeVisible();
  await page.waitForTimeout(3800);

  await page.getByRole("button", { name: "Hold the flame" }).click();
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Resume the vigil" }).click();
  await page.waitForTimeout(1600);

  await page.clock.fastForward(62_000);
  await expect(page.getByRole("heading", { level: 1, name: "Finish the opening chapter" })).toBeVisible();
  await page.waitForTimeout(2600);

  await page.getByRole("button", { name: "Forge a local keeper & seal" }).click();
  await expect(page.getByText("signature verified")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3000);

  await page.getByRole("button", { name: "Enter the crypt" }).click();
  await expect(page.getByRole("heading", { name: "What the dark kept." })).toBeVisible();
  await page.waitForTimeout(2600);

  await page.locator(".constellation").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600);

  const video = page.video();
  await context.close();
  if (!video) throw new Error("Playwright did not record a video.");
  await video.saveAs("demo-artifacts/vesper-walkthrough.webm");
  console.log(`saved ${await video.path()}`);
});
