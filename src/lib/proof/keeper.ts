import bs58 from "bs58";
// tweetnacl ships as CommonJS; a namespace import loses `sign` under Node ESM.
import nacl from "tweetnacl";

export interface SolanaKeeper {
  address: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

function keeperFromPair(pair: nacl.SignKeyPair): SolanaKeeper {
  return {
    address: bs58.encode(pair.publicKey),
    publicKey: pair.publicKey,
    secretKey: pair.secretKey,
  };
}

export function createKeeper(): SolanaKeeper {
  return keeperFromPair(nacl.sign.keyPair());
}

export function keeperFromSecret(secretKey: Uint8Array): SolanaKeeper {
  if (secretKey.length !== nacl.sign.secretKeyLength) {
    throw new Error("That secret is not an Ed25519 signing key.");
  }
  return keeperFromPair(nacl.sign.keyPair.fromSecretKey(secretKey));
}

export function verifyMessage(message: string, signature: string, address: string): boolean {
  try {
    const signatureBytes = bs58.decode(signature);
    const publicKey = bs58.decode(address);
    if (signatureBytes.length !== nacl.sign.signatureLength) return false;
    if (publicKey.length !== nacl.sign.publicKeyLength) return false;
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      signatureBytes,
      publicKey,
    );
  } catch {
    return false;
  }
}

export function signMessage(keeper: SolanaKeeper, message: string): string {
  const signature = bs58.encode(
    nacl.sign.detached(new TextEncoder().encode(message), keeper.secretKey),
  );
  if (!verifyMessage(message, signature, keeper.address)) {
    throw new Error("The keeper could not verify its own signature.");
  }
  return signature;
}
