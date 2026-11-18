import { describe, expect, it } from "vitest";
import {
  KEYSTORE_KEY,
  LEGACY_WALLET_KEY,
  migrateLegacyWallet,
  type KeyValueStore,
} from "../src/lib/proof/migrate";
import { unlockKeystore, type KeystoreV2 } from "../src/lib/proof/keystore";

const PASSPHRASE = "the old word";
const PRIVATE_KEY = `0x${"7a".repeat(32)}`;
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

function legacyWallet(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: "local",
    address: ADDRESS,
    chainId: 8453,
    privateKey: PRIVATE_KEY,
    ...overrides,
  });
}

describe("legacy wallet migration", () => {
  it("wraps the key, proves it reads back, then removes the plaintext", async () => {
    const store = memoryStore({ [LEGACY_WALLET_KEY]: legacyWallet() });
    expect(await migrateLegacyWallet(store, PASSPHRASE)).toBe(true);

    const keystore = JSON.parse(store.get(KEYSTORE_KEY) ?? "") as KeystoreV2;
    const secret = await unlockKeystore(keystore, PASSPHRASE);
    expect(Array.from(secret)).toEqual(Array.from({ length: 32 }, () => 0x7a));

    const legacy = JSON.parse(store.get(LEGACY_WALLET_KEY) ?? "") as Record<string, unknown>;
    expect(legacy.privateKey).toBeUndefined();
    expect(legacy).toMatchObject({ kind: "local", address: ADDRESS, chainId: 8453 });
    expect(store.get(LEGACY_WALLET_KEY)).not.toContain("7a7a7a");
  }, 30_000);

  it("does nothing when there is no plaintext key", async () => {
    expect(await migrateLegacyWallet(memoryStore(), PASSPHRASE)).toBe(false);
    const already = memoryStore({ [LEGACY_WALLET_KEY]: legacyWallet({ privateKey: undefined }) });
    expect(await migrateLegacyWallet(already, PASSPHRASE)).toBe(false);
  });

  it("keeps the plaintext when the keystore cannot be written back", async () => {
    const base = memoryStore({ [LEGACY_WALLET_KEY]: legacyWallet() });
    const broken: KeyValueStore = {
      get: base.get,
      set: (key, value) => {
        if (key !== KEYSTORE_KEY) base.set(key, value);
      },
    };
    await expect(migrateLegacyWallet(broken, PASSPHRASE)).rejects.toThrow(/could not be written/);
    expect(base.get(LEGACY_WALLET_KEY)).toContain("7a7a7a");
  }, 30_000);
});
