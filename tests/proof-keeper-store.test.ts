import { describe, expect, it } from "vitest";
import {
  KEEPER_STORAGE_KEY,
  forgeKeeper,
  loadKeystore,
  unlockKeeper,
  type KeyValueStore,
} from "../src/lib/proof/keeperStore";

const PASSPHRASE = "the long word";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("keeper storage", () => {
  it("wraps a fresh keeper, proves it reads back, and opens it again", async () => {
    const store = memoryStore();
    const opened = await forgeKeeper(store, PASSPHRASE);
    const raw = store.get(KEEPER_STORAGE_KEY) ?? "";
    expect(JSON.parse(raw)).toMatchObject({ v: 2, address: opened.keeper.address });
    expect(raw).not.toContain("secretKey");

    const again = await unlockKeeper(store, PASSPHRASE);
    expect(again.keeper.address).toBe(opened.keeper.address);
    expect(Array.from(again.keeper.publicKey)).toEqual(Array.from(opened.keeper.publicKey));
  }, 30_000);

  it("fails closed on a wrong passphrase or a missing keeper", async () => {
    const store = memoryStore();
    await expect(unlockKeeper(store, PASSPHRASE)).rejects.toThrow(/No keeper/);
    await forgeKeeper(store, PASSPHRASE);
    await expect(unlockKeeper(store, "a different word")).rejects.toThrow(/did not open/);
  }, 30_000);

  it("refuses a keystore whose address was rewritten", async () => {
    const store = memoryStore();
    const opened = await forgeKeeper(store, PASSPHRASE);
    const keystore = loadKeystore(store)!;
    store.set(
      KEEPER_STORAGE_KEY,
      JSON.stringify({ ...keystore, address: "So11111111111111111111111111111111111111112" }),
    );
    await expect(unlockKeeper(store, PASSPHRASE)).rejects.toThrow(/does not belong/);
    expect(opened.keeper.address).not.toBe("So11111111111111111111111111111111111111112");
  }, 30_000);

  it("requires a passphrase long enough to mean something", async () => {
    await expect(forgeKeeper(memoryStore(), "short")).rejects.toThrow(/at least 8/);
  });

  it("treats a malformed store as empty", () => {
    expect(loadKeystore(memoryStore({ [KEEPER_STORAGE_KEY]: "{" }))).toBeNull();
    expect(loadKeystore(memoryStore({ [KEEPER_STORAGE_KEY]: JSON.stringify({ v: 1 }) }))).toBeNull();
  });
});
