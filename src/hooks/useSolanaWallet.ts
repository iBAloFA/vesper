import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectedWallet, StandardWallet } from "../lib/proof/walletStandard";

export interface SolanaWalletApi {
  names: string[];
  connect: (name: string) => Promise<ConnectedWallet>;
}

type ConnectWallet = (
  wallet: StandardWallet,
  cluster: string,
) => Promise<ConnectedWallet>;

export function useSolanaWallet(cluster: string): SolanaWalletApi {
  const [names, setNames] = useState<string[]>([]);
  const walletsRef = useRef<readonly StandardWallet[]>([]);
  const connectRef = useRef<ConnectWallet | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void import("../lib/proof/walletStandard")
      .then((loaded) => {
        if (cancelled) return;
        connectRef.current = loaded.connectWallet;
        stop = loaded.watchWallets(cluster, (wallets) => {
          walletsRef.current = wallets;
          setNames(wallets.map((wallet) => wallet.name));
        });
      })
      .catch(() => {
        // Without the wallet module the page can still seal with a local keeper.
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [cluster]);

  const connect = useCallback(
    async (name: string) => {
      const connectWallet = connectRef.current;
      if (!connectWallet) throw new Error("The wallet support is still waking. Try again in a moment.");
      const wallet = walletsRef.current.find((item) => item.name === name);
      if (!wallet) throw new Error("That wallet is no longer here.");
      return connectWallet(wallet, cluster);
    },
    [cluster],
  );

  return { names, connect };
}
