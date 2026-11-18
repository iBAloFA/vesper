import { useCallback, useEffect, useRef, useState } from "react";
import type { SolanaKeeper } from "../lib/proof/keeper";
import { createIdleLock, type IdleLock, type KeystoreV2 } from "../lib/proof/keystore";
import { forgeKeeper, loadKeystore, unlockKeeper, type KeyValueStore } from "../lib/proof/keeperStore";

export interface SolanaKeeperApi {
  keystore: KeystoreV2 | null;
  keeper: SolanaKeeper | null;
  address: string | null;
  locked: boolean;
  forge: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
}

function localStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    return {
      get: (key) => {
        try {
          return storage.getItem(key);
        } catch {
          return null;
        }
      },
      set: (key, value) => storage.setItem(key, value),
    };
  } catch {
    return null;
  }
}

export function useSolanaKeeper(): SolanaKeeperApi {
  const [keystore, setKeystore] = useState<KeystoreV2 | null>(() => {
    const store = localStore();
    return store ? loadKeystore(store) : null;
  });
  const [keeper, setKeeper] = useState<SolanaKeeper | null>(null);
  const idleRef = useRef<IdleLock | null>(null);

  const lock = useCallback(() => {
    idleRef.current?.stop();
    idleRef.current = null;
    setKeeper(null);
  }, []);

  useEffect(() => {
    if (!keeper) return;
    const idle = createIdleLock(() => {
      idleRef.current = null;
      setKeeper(null);
    });
    idleRef.current = idle;
    const touch = () => idle.touch();
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      idle.stop();
      idleRef.current = null;
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, [keeper]);

  const forge = useCallback(async (passphrase: string) => {
    const store = localStore();
    if (!store) throw new Error("This browser will not keep a keeper.");
    const opened = await forgeKeeper(store, passphrase);
    setKeystore(opened.keystore);
    setKeeper(opened.keeper);
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    const store = localStore();
    if (!store) throw new Error("This browser will not keep a keeper.");
    const opened = await unlockKeeper(store, passphrase);
    setKeystore(opened.keystore);
    setKeeper(opened.keeper);
  }, []);

  return {
    keystore,
    keeper,
    address: keeper?.address ?? keystore?.address ?? null,
    locked: keystore !== null && keeper === null,
    forge,
    unlock,
    lock,
  };
}
