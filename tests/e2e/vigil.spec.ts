import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { verifyAttestation } from "../../src/lib/attestation";
import type { StoredAttestation } from "../../src/lib/types";

async function beginVigil(page: Page, intention: string, minutes = 1): Promise<void> {
  await page.goto("/#/vigil");
  await page.getByLabel("Name the thing").fill(intention);
  await page.getByRole("button", { name: "Custom" }).click();
  await page.getByLabel("Minutes").fill(String(minutes));
  await page.getByRole("button", { name: /Light the candle/ }).click();
  await expect(page.getByRole("heading", { name: "What will you keep?" })).toBeHidden();
}

test("landing renders and navigation reaches the crypt", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Vesper/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep a vigil");
  await expect(page.getByRole("button", { name: "Sound off" })).toBeVisible();

  await page.getByRole("link", { name: "The crypt", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nothing has been kept here yet." })).toBeVisible();
});

test("a paused vigil survives a reload and can be released", async ({ page }) => {
  const intention = "Answer the letter";
  await beginVigil(page, intention, 5);
  await expect(page.getByRole("timer")).toHaveText(/0[45]:\d{2}/);

  await page.getByRole("button", { name: "Hold the flame" }).click();
  await expect(page.getByText("The vigil is held")).toBeVisible();

  await page.reload();
  await expect(page.getByText("The vigil is held")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume the vigil" })).toBeVisible();

  await page.getByRole("button", { name: "Resume the vigil" }).click();
  await expect(page.getByText("The vigil is burning")).toBeVisible();

  await page.getByRole("button", { name: "Break the vigil" }).click();
  await page.getByRole("button", { name: "Release it" }).click();

  await expect(page.getByRole("heading", { name: "What the dark kept." })).toBeVisible();
  await expect(page.locator(".ledger__row").filter({ hasText: intention })).toBeVisible();
  await expect(page.locator(".stat").filter({ hasText: "Focus kept" })).toContainText("0m");
});

test("a completed vigil seals, verifies, and exports", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.clock.install();
  const intention = "Finish the opening chapter";
  await beginVigil(page, intention, 1);
  await expect(page.getByRole("timer")).toHaveText("01:00");

  await page.clock.fastForward(61_000);

  await expect(page.getByRole("heading", { level: 1, name: intention })).toBeVisible();
  await expect(page.locator(".page-head .meta-chips")).toContainText("kept");
  await expect(page.getByText("seal matches record")).toBeVisible();
  const evmAttestation = page.getByRole("region", { name: "Attestation" });
  await expect(evmAttestation.getByText("unsigned", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Forge a local keeper & seal" }).click();
  await expect(evmAttestation.getByText("signature verified")).toBeVisible({ timeout: 20_000 });
  await expect(evmAttestation.getByText("unsigned", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Enter the crypt" }).click();
  await expect(page.getByRole("heading", { name: "What the dark kept." })).toBeVisible();
  await expect(page.locator(".stat").filter({ hasText: "Sealed sigils" })).toContainText("1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export archive" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const archive = JSON.parse(await readFile(path!, "utf8")) as {
    app: string;
    vigils: Array<{ id: string; attestation?: StoredAttestation }>;
  };
  expect(archive.app).toBe("vesper");
  expect(archive.vigils).toHaveLength(1);
  const attestation = archive.vigils[0]!.attestation;
  expect(attestation).toBeTruthy();
  expect(await verifyAttestation(attestation!)).toBe(true);

  expect(errors).toEqual([]);
});
