import { expect, test } from "@playwright/test";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

test("connects an injected wallet and shows the keeper", async ({ page }) => {
  await page.addInitScript((address: string) => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") return [address];
        if (method === "eth_chainId") return "0x2105";
        throw new Error(`unexpected ${method}`);
      },
    };
  }, ADDRESS);

  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Connect browser wallet" }).click();

  await expect(page.getByText("Browser wallet", { exact: true })).toBeVisible();
  await expect(page.getByText(ADDRESS, { exact: true })).toBeVisible();
  await expect(page.getByText("Chain 8453", { exact: true })).toBeVisible();
});
