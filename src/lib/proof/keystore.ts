export interface KeystoreV2 {
  v: 2;
  address: string;
  createdAt: string;
  kdf: { name: "PBKDF2-SHA256"; iterations: number; salt: string };
  cipher: { name: "AES-256-GCM"; iv: string; data: string };
}

export const KEEPER_IDLE_MS = 15 * 60_000;
export const KEYSTORE_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSPHRASE_ITERATIONS = 600_000;
const UNLOCK_ERROR = "That passphrase did not open the keeper.";

function subtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This environment cannot open encrypted keepers.");
  return subtle;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const material = await subtleCrypto().importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtleCrypto().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createKeystore(
  secret: Uint8Array,
  passphrase: string,
  address: string,
): Promise<KeystoreV2> {
  if (secret.length < 16) throw new Error("The secret is too short to wrap.");
  if (!passphrase) throw new Error("A passphrase is required.");
  subtleCrypto();
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt, KEYSTORE_ITERATIONS);
  const data = await subtleCrypto().encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    copyBytes(secret),
  );
  return {
    v: 2,
    address,
    createdAt: new Date().toISOString(),
    kdf: { name: "PBKDF2-SHA256", iterations: KEYSTORE_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: "AES-256-GCM", iv: toBase64(iv), data: toBase64(new Uint8Array(data)) },
  };
}

export async function unlockKeystore(store: KeystoreV2, passphrase: string): Promise<Uint8Array> {
  subtleCrypto();
  try {
    if (store?.v !== 2) throw new Error("version");
    if (store.kdf?.name !== "PBKDF2-SHA256" || store.cipher?.name !== "AES-256-GCM") {
      throw new Error("scheme");
    }
    const iterations = store.kdf.iterations;
    if (!Number.isInteger(iterations) || iterations < MIN_PASSPHRASE_ITERATIONS) {
      throw new Error("iterations");
    }
    const salt = fromBase64(store.kdf.salt);
    const iv = fromBase64(store.cipher.iv);
    const data = fromBase64(store.cipher.data);
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || data.length <= IV_BYTES) {
      throw new Error("length");
    }
    const key = await deriveKey(passphrase, salt, iterations);
    const plain = await subtleCrypto().decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      data,
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error(UNLOCK_ERROR);
  }
}

export interface IdleLock {
  touch(): void;
  stop(): void;
}

export function createIdleLock(onLock: () => void, timeoutMs = KEEPER_IDLE_MS): IdleLock {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      onLock();
    }, timeoutMs);
  };
  arm();
  return {
    touch: arm,
    stop: () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
