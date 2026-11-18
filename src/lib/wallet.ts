import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex, TypedData } from "viem";
import { buildTypedData, type VigilTypedData } from "./attestation";
import { SITE } from "./site";
import type { StoredAttestation, Vigil, WalletKind, WalletRecord } from "./types";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

function injectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return candidate ?? null;
}

function asViemTypedData(data: VigilTypedData) {
  return {
    domain: data.domain,
    types: data.types as unknown as TypedData,
    primaryType: "Vigil" as const,
    message: data.message as unknown as Record<string, unknown>,
  };
}

async function injectedChainId(provider: Eip1193Provider): Promise<number> {
  const raw = await provider.request({ method: "eth_chainId" });
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 16) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("The wallet reported an unknown chain.");
  return parsed;
}

export function hasInjectedWallet(): boolean {
  return injectedProvider() !== null;
}

export async function connectInjected(): Promise<WalletRecord> {
  const provider = injectedProvider();
  if (!provider) {
    throw new Error("No browser wallet was found. Install one, or open a local keeper instead.");
  }
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("The wallet did not return a usable address.");
  }
  const chainId = await injectedChainId(provider);
  return { kind: "injected", address: address as Hex, chainId };
}

export function createLocalKeeper(): WalletRecord {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    kind: "local",
    address: account.address,
    chainId: SITE.chainId,
    privateKey,
  };
}

function storedAttestation(
  wallet: WalletRecord,
  data: VigilTypedData,
  signature: Hex,
): StoredAttestation {
  return {
    address: wallet.address,
    chainId: wallet.chainId,
    kind: wallet.kind,
    signature,
    signedAt: Date.now(),
    domain: {
      name: "Vesper",
      version: "1",
      chainId: data.domain.chainId,
      ...(data.domain.verifyingContract ? { verifyingContract: data.domain.verifyingContract } : {}),
    },
    message: {
      id: data.message.id,
      keeper: data.message.keeper,
      startedAt: data.message.startedAt.toString(),
      durationMin: data.message.durationMin,
      seal: data.message.seal,
    },
  };
}

export async function signVigil(
  wallet: WalletRecord,
  vigil: Vigil,
  verifyingContract?: Hex,
): Promise<StoredAttestation> {
  const data = buildTypedData(vigil, wallet.address, wallet.chainId, verifyingContract);
  if (wallet.kind === "local") {
    if (!wallet.privateKey) throw new Error("This local keeper has no key.");
    const account = privateKeyToAccount(wallet.privateKey);
    const signature = await account.signTypedData(asViemTypedData(data));
    return storedAttestation(wallet, data, signature);
  }

  const provider = injectedProvider();
  if (!provider) throw new Error("The browser wallet is no longer available.");
  const currentChain = await injectedChainId(provider);
  if (currentChain !== wallet.chainId) {
    throw new Error(`Switch the wallet to chain ${wallet.chainId} and try again.`);
  }
  const payload = {
    domain: data.domain,
    types: data.types,
    primaryType: "Vigil",
    message: {
      id: data.message.id,
      keeper: data.message.keeper,
      startedAt: data.message.startedAt.toString(),
      durationMin: data.message.durationMin,
      seal: data.message.seal,
    },
  };
  const signature = await provider.request({
    method: "eth_signTypedData_v4",
    params: [wallet.address, JSON.stringify(payload)],
  });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("The wallet returned an unusable signature.");
  }
  return storedAttestation(wallet, data, signature as Hex);
}

export function watchInjectedWallet(onChange: () => void): () => void {
  const provider = injectedProvider();
  if (!provider?.on) return () => {};
  provider.on("accountsChanged", onChange);
  provider.on("chainChanged", onChange);
  return () => {
    provider.removeListener?.("accountsChanged", onChange);
    provider.removeListener?.("chainChanged", onChange);
  };
}

export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function walletKindLabel(kind: WalletKind): string {
  return kind === "local" ? "Local keeper" : "Browser wallet";
}
