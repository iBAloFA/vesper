import { afterEach, describe, expect, it, vi } from "vitest";
import { connectInjected, hasInjectedWallet } from "../src/lib/wallet";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

type RequestArgs = { method: string; params?: unknown };
type Stub = { request: (args: RequestArgs) => Promise<unknown> };

const globalWithWindow = globalThis as unknown as { window?: { ethereum?: unknown } };

function stubEthereum(provider: unknown): void {
  globalWithWindow.window = { ethereum: provider };
}

afterEach(() => {
  delete globalWithWindow.window;
  vi.useRealTimers();
});

describe("connectInjected", () => {
  it("returns an injected wallet record from a responsive provider", async () => {
    const provider: Stub = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") return [ADDRESS];
        if (method === "eth_chainId") return "0x2105";
        throw new Error(`unexpected ${method}`);
      },
    };
    stubEthereum(provider);

    await expect(connectInjected()).resolves.toEqual({ kind: "injected", address: ADDRESS, chainId: 8453 });
  });

  it("rejects when no provider is injected", async () => {
    await expect(connectInjected()).rejects.toThrow(/No browser wallet was found/);
  });

  it("rejects a provider that never answers instead of hanging", async () => {
    vi.useFakeTimers();
    stubEthereum({ request: () => new Promise<never>(() => {}) });

    const pending = connectInjected();
    const assertion = expect(pending).rejects.toThrow(/did not answer/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("rejects an address the wallet did not supply", async () => {
    stubEthereum({
      request: async ({ method }: RequestArgs) => (method === "eth_requestAccounts" ? [] : "0x2105"),
    });

    await expect(connectInjected()).rejects.toThrow(/usable address/);
  });
});

describe("hasInjectedWallet", () => {
  it("is false when nothing is injected", () => {
    expect(hasInjectedWallet()).toBe(false);
  });

  it("is false for an object that cannot make requests", () => {
    stubEthereum({});
    expect(hasInjectedWallet()).toBe(false);
  });

  it("is true for a provider with a request method", () => {
    stubEthereum({ request: async () => null });
    expect(hasInjectedWallet()).toBe(true);
  });
});
