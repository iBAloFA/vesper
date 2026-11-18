import { createKeystore, unlockKeystore, type KeystoreV2 } from "./keystore";
import { createKeeper, keeperFromSecret, type SolanaKeeper } from "./keeper";

export const KEEPER_STORAGE_KEY = "vesper.keeper.v2";
export const MIN_PASSPHRASE_LENGTH = 8;

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface OpenedKeeper {
  keystore: KeystoreV2;
  keeper: SolanaKeeper;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

export function loadKeystore(store: KeyValueStore): KeystoreV2 | null {
  const raw = store.get(KEEPER_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KeystoreV2;
    if (parsed?.v !== 2 || typeof parsed.address !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function forgeKeeper(store: KeyValueStore, passphrase: string): Promise<OpenedKeeper> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSPHRASE_LENGTH} characters for the passphrase.`);
  }
  const keeper = createKeeper();
  const keystore = await createKeystore(keeper.secretKey, passphrase, keeper.address);
  store.set(KEEPER_STORAGE_KEY, JSON.stringify(keystore));

  const written = loadKeystore(store);
  if (!written) throw new Error("The keeper could not be written to this browser.");
  const reopened = await unlockKeystore(written, passphrase);
  if (!sameBytes(reopened, keeper.secretKey)) {
    throw new Error("The keystore did not read back the same key.");
  }
  return { keystore: written, keeper };
}

export async function unlockKeeper(store: KeyValueStore, passphrase: string): Promise<OpenedKeeper> {
  const keystore = loadKeystore(store);
  if (!keystore) throw new Error("No keeper has been forged on this device yet.");
  const keeper = keeperFromSecret(await unlockKeystore(keystore, passphrase));
  if (keeper.address !== keystore.address) {
    throw new Error("The keystore does not belong to this keeper.");
  }
  return { keystore, keeper };
}
