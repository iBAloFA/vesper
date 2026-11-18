import { createKeystore, unlockKeystore, type KeystoreV2 } from "./keystore";

export const LEGACY_WALLET_KEY = "vesper.wallet.v1";
export const KEYSTORE_KEY = "vesper.keystore.v1";

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

interface LegacyWallet {
  kind?: string;
  address?: string;
  chainId?: number;
  privateKey?: string;
}

function hexToBytes(hex: string): Uint8Array {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(body) || body.length % 2 !== 0) {
    throw new Error("The stored key is not valid hex.");
  }
  const bytes = new Uint8Array(body.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(body.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

/**
 * Encrypts a v1 plaintext key and removes it only after the written keystore
 * decrypts back to the same bytes. Any failure leaves the plaintext in place.
 */
export async function migrateLegacyWallet(
  store: KeyValueStore,
  passphrase: string,
): Promise<boolean> {
  const raw = store.get(LEGACY_WALLET_KEY);
  if (!raw) return false;
  const wallet = JSON.parse(raw) as LegacyWallet;
  if (!wallet.privateKey) return false;
  const secret = hexToBytes(wallet.privateKey);
  const keystore = await createKeystore(secret, passphrase, wallet.address ?? "");
  store.set(KEYSTORE_KEY, JSON.stringify(keystore));

  const written = store.get(KEYSTORE_KEY);
  if (!written) throw new Error("The keystore could not be written.");
  const reopened = await unlockKeystore(JSON.parse(written) as KeystoreV2, passphrase);
  if (!sameBytes(reopened, secret)) {
    throw new Error("The keystore did not read back the same key.");
  }

  const rest: LegacyWallet = { ...wallet };
  delete rest.privateKey;
  store.set(LEGACY_WALLET_KEY, JSON.stringify(rest));
  return true;
}
