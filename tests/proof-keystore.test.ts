import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEYSTORE_ITERATIONS,
  KEEPER_IDLE_MS,
  createIdleLock,
  createKeystore,
  unlockKeystore,
  type KeystoreV2,
} from "../src/lib/proof/keystore";
import { createKeeper } from "../src/lib/proof/keeper";

const PASSPHRASE = "a quiet word before the candle";
const keeper = createKeeper();

function decodeBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("encrypted keystore", () => {
  it("wraps and unwraps the keeper secret", async () => {
    const store = await createKeystore(keeper.secretKey, PASSPHRASE, keeper.address);
    expect(store.v).toBe(2);
    expect(store.address).toBe(keeper.address);
    expect(store.kdf).toMatchObject({ name: "PBKDF2-SHA256", iterations: KEYSTORE_ITERATIONS });
    expect(decodeBase64(store.kdf.salt)).toHaveLength(16);
    expect(decodeBase64(store.cipher.iv)).toHaveLength(12);
    expect(store.cipher.name).toBe("AES-256-GCM");

    expect(Array.from(await unlockKeystore(store, PASSPHRASE))).toEqual(Array.from(keeper.secretKey));
  }, 20_000);

  it("never stores the secret in the clear", async () => {
    const store = await createKeystore(keeper.secretKey, PASSPHRASE, keeper.address);
    const json = JSON.stringify(store);
    const secretBase64 = btoa(String.fromCharCode(...keeper.secretKey));
    expect(json).not.toContain(secretBase64);
    expect(json).not.toContain(keeper.secretKey.slice(0, 16).join(","));
    expect(json).not.toContain(PASSPHRASE);
  }, 20_000);

  it("fails closed on the wrong passphrase", async () => {
    const store = await createKeystore(keeper.secretKey, PASSPHRASE, keeper.address);
    await expect(unlockKeystore(store, "a different word")).rejects.toThrow(/did not open the keeper/);
  }, 20_000);

  it("fails closed on tampered ciphertext or iv", async () => {
    const store = await createKeystore(keeper.secretKey, PASSPHRASE, keeper.address);
    const data = decodeBase64(store.cipher.data);
    data[0] ^= 0x01;
    const tamperedData: KeystoreV2 = {
      ...store,
      cipher: { ...store.cipher, data: btoa(String.fromCharCode(...data)) },
    };
    await expect(unlockKeystore(tamperedData, PASSPHRASE)).rejects.toThrow(/did not open/);

    const iv = decodeBase64(store.cipher.iv);
    iv[0] ^= 0x01;
    const tamperedIv: KeystoreV2 = {
      ...store,
      cipher: { ...store.cipher, iv: btoa(String.fromCharCode(...iv)) },
    };
    await expect(unlockKeystore(tamperedIv, PASSPHRASE)).rejects.toThrow(/did not open/);
  }, 30_000);

  it("refuses a downgraded iteration count and foreign structures", async () => {
    const store = await createKeystore(keeper.secretKey, PASSPHRASE, keeper.address);
    const downgraded: KeystoreV2 = {
      ...store,
      kdf: { ...store.kdf, iterations: 1_000 },
    };
    await expect(unlockKeystore(downgraded, PASSPHRASE)).rejects.toThrow(/did not open/);
    await expect(
      unlockKeystore({ ...store, v: 1 } as unknown as KeystoreV2, PASSPHRASE),
    ).rejects.toThrow(/did not open/);
  }, 20_000);

  it("requires a passphrase and a full secret", async () => {
    await expect(createKeystore(keeper.secretKey, "", keeper.address)).rejects.toThrow(/passphrase/);
    await expect(createKeystore(new Uint8Array(8), PASSPHRASE, keeper.address)).rejects.toThrow(/short/);
  });
});

describe("idle lock", () => {
  it("locks after the idle window and re-arms on touch", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    const lock = createIdleLock(onLock, 1_000);
    vi.advanceTimersByTime(900);
    lock.touch();
    vi.advanceTimersByTime(900);
    expect(onLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("stops without locking when the keeper is closed", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    createIdleLock(onLock, 1_000).stop();
    vi.advanceTimersByTime(5_000);
    expect(onLock).not.toHaveBeenCalled();
  });

  it("defaults to fifteen minutes", () => {
    expect(KEEPER_IDLE_MS).toBe(15 * 60_000);
  });
});
