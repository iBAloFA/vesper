import bs58 from "bs58";
import { verifyMessage } from "./keeper";

interface WalletAccount {
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
}

export interface StandardWallet {
  name: string;
  chains?: readonly string[];
  accounts?: readonly WalletAccount[];
  features: Record<string, unknown>;
}

interface ConnectFeature {
  connect(): Promise<{ accounts: readonly WalletAccount[] }>;
}

interface SignMessageFeature {
  signMessage(
    ...inputs: { message: Uint8Array; account: WalletAccount }[]
  ): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
}

interface RegisterApi {
  register(...wallets: StandardWallet[]): () => void;
}

export interface ConnectedWallet {
  name: string;
  address: string;
  sign: (message: string) => Promise<string>;
}

const CHAIN_ALIAS: Record<string, string> = { "mainnet-beta": "mainnet" };

export function walletChain(cluster: string): string {
  return `solana:${CHAIN_ALIAS[cluster] ?? cluster}`;
}

function forChain(wallet: StandardWallet, chain: string): boolean {
  if (wallet.chains?.includes(chain)) return true;
  return Boolean(wallet.accounts?.some((account) => account.chains?.includes(chain)));
}

export function watchWallets(
  cluster: string,
  onChange: (wallets: readonly StandardWallet[]) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const chain = walletChain(cluster);
  const registered: StandardWallet[] = [];
  const api: RegisterApi = {
    register(...wallets) {
      let added = false;
      for (const wallet of wallets) {
        if (!wallet || typeof wallet.name !== "string" || !wallet.features) continue;
        if (!forChain(wallet, chain)) continue;
        if (registered.includes(wallet)) continue;
        registered.push(wallet);
        added = true;
      }
      if (added) onChange([...registered]);
      return () => {};
    },
  };
  const onRegister = (event: Event) => {
    const detail = (event as CustomEvent<((api: RegisterApi) => void) | undefined>).detail;
    if (typeof detail === "function") detail(api);
  };
  window.addEventListener("wallet-standard:register-wallet", onRegister);

  const legacy = (window.navigator as Navigator & { wallets?: unknown }).wallets;
  if (Array.isArray(legacy)) {
    for (const callback of legacy) {
      if (typeof callback !== "function") continue;
      try {
        (callback as (api: RegisterApi) => void)(api);
      } catch {
        // A wallet that cannot register itself is simply not offered.
      }
    }
  }

  window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
  return () => window.removeEventListener("wallet-standard:register-wallet", onRegister);
}

export async function connectWallet(
  wallet: StandardWallet,
  cluster: string,
): Promise<ConnectedWallet> {
  const chain = walletChain(cluster);
  const connect = wallet.features["standard:connect"] as ConnectFeature | undefined;
  if (!connect || typeof connect.connect !== "function") {
    throw new Error(`${wallet.name} cannot be connected from this page.`);
  }
  const connected = await connect.connect();
  const accounts = (connected.accounts ?? wallet.accounts ?? []).filter((account) =>
    account.chains?.includes(chain),
  );
  const account = accounts[0];
  if (!account) throw new Error(`${wallet.name} has no account on ${chain}.`);
  if (account.publicKey && bs58.encode(account.publicKey) !== account.address) {
    throw new Error(`${wallet.name} reported a key that does not match its address.`);
  }
  const signer = wallet.features["solana:signMessage"] as SignMessageFeature | undefined;
  if (!signer || typeof signer.signMessage !== "function") {
    throw new Error(`${wallet.name} cannot sign messages.`);
  }

  return {
    name: wallet.name,
    address: account.address,
    sign: async (message: string) => {
      const [output] = await signer.signMessage({
        message: new TextEncoder().encode(message),
        account,
      });
      const bytes = output?.signature;
      if (!bytes || bytes.length !== 64) {
        throw new Error(`${wallet.name} returned an unreadable signature.`);
      }
      const signature = bs58.encode(bytes);
      if (!verifyMessage(message, signature, account.address)) {
        throw new Error(`${wallet.name}'s signature did not match its own key.`);
      }
      return signature;
    },
  };
}
