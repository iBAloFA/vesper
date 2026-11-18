import { useCallback, useEffect, useState } from "react";
import {
  clearWalletStorage,
  loadWallet,
  saveWallet,
} from "../lib/storage";
import {
  connectInjected,
  createLocalKeeper,
  hasInjectedWallet,
  watchInjectedWallet,
} from "../lib/wallet";
import type { WalletRecord } from "../lib/types";

export interface WalletApi {
  wallet: WalletRecord | null;
  injectedAvailable: boolean;
  connectBrowserWallet: () => Promise<WalletRecord>;
  createKeeper: () => WalletRecord;
  disconnect: () => void;
}

export function useWallet(): WalletApi {
  const [wallet, setWallet] = useState<WalletRecord | null>(() => loadWallet());
  const [injectedAvailable, setInjectedAvailable] = useState(() => hasInjectedWallet());

  useEffect(() => {
    if (wallet) saveWallet(wallet);
    else clearWalletStorage();
  }, [wallet]);

  useEffect(() => {
    setInjectedAvailable(hasInjectedWallet());
    return watchInjectedWallet(() => {
      setInjectedAvailable(hasInjectedWallet());
      setWallet((current) => (current?.kind === "injected" ? loadWallet() : current));
    });
  }, []);

  const connectBrowserWallet = useCallback(async () => {
    const record = await connectInjected();
    setWallet(record);
    return record;
  }, []);

  const createKeeper = useCallback(() => {
    const record = createLocalKeeper();
    setWallet(record);
    return record;
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
  }, []);

  return { wallet, injectedAvailable, connectBrowserWallet, createKeeper, disconnect };
}
