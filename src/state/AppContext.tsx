import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AmbienceEngine } from "../lib/audio";
import { buildSeal } from "../lib/attestation";
import { composeTransmission } from "../lib/transmissions";
import { beginSnapshot, type VigilSetup } from "../lib/timer";
import type { Levels, TimerResult, Vigil } from "../lib/types";
import { computeStats, type FocusStats } from "../lib/stats";
import { useVault, type VaultApi } from "../hooks/useVault";
import { useWallet, type WalletApi } from "../hooks/useWallet";
import { useVigilTimer, type VigilTimerApi } from "../hooks/useVigilTimer";
import { ConfirmDialog, type ConfirmOptions } from "../components/ConfirmDialog";
import { ToastStack, type ToastKind, type ToastMessage } from "../components/ToastStack";

export type Route = "/" | "/vigil" | "/crypt" | "/ledger" | "/settings" | "/return";

export const ROUTES: readonly Route[] = ["/", "/vigil", "/crypt", "/ledger", "/settings", "/return"];

const TITLES: Record<Route, string> = {
  "/": "Vesper — Proof of Focus",
  "/vigil": "Keep a vigil — Vesper",
  "/crypt": "The crypt — Vesper",
  "/ledger": "The ledger — Vesper",
  "/settings": "Settings — Vesper",
  "/return": "The return — Vesper",
};

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").split("?")[0] || "/";
  return ROUTES.includes(path as Route) ? (path as Route) : "/";
}

export interface AppContextValue {
  route: Route;
  navigate: (route: Route) => void;
  vault: VaultApi;
  settings: VaultApi["vault"]["settings"];
  stats: FocusStats;
  wallet: WalletApi;
  timer: VigilTimerApi;
  returnVigil: Vigil | null;
  beginVigil: (setup: VigilSetup) => void;
  releaseVigil: () => void;
  openReturn: (vigilId: string) => void;
  clearReturn: (next?: Route) => void;
  soundEnabled: boolean;
  soundBusy: boolean;
  toggleSound: () => void;
  startSound: (levels?: Levels) => Promise<void>;
  stopSound: () => void;
  applyLevels: (levels: Levels) => void;
  toast: (message: string, kind?: ToastKind) => void;
  toasts: ToastMessage[];
  dismissToast: (id: number) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const vault = useVault();
  const wallet = useWallet();
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [returnId, setReturnId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundBusy, setSoundBusy] = useState(false);
  const [liveLevels, setLiveLevels] = useState<Levels>(vault.vault.settings.levels);
  const [pendingConfirm, setPendingConfirm] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);
  const engineRef = useRef<AmbienceEngine | null>(null);
  const toastTimers = useRef<number[]>([]);
  const toastId = useRef(0);

  const navigate = useCallback((next: Route) => {
    if (typeof window === "undefined") return;
    const target = `#${next}`;
    if (window.location.hash === target) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      setRoute(next);
      return;
    }
    window.location.hash = next;
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) window.location.replace("#/");
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.title = TITLES[route];
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route]);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "user-reduce-motion",
      vault.vault.settings.reduceMotion,
    );
  }, [vault.vault.settings.reduceMotion]);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current.slice(-3), { id, message, kind }]);
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4800);
    toastTimers.current.push(timer);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(
    () => () => {
      for (const timer of toastTimers.current) window.clearTimeout(timer);
      toastTimers.current = [];
    },
    [],
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm((current) => {
        current?.resolve(false);
        return { options, resolve };
      });
    });
  }, []);

  const settleConfirm = useCallback(
    (value: boolean) => {
      setPendingConfirm((current) => {
        current?.resolve(value);
        return null;
      });
    },
    [],
  );

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = new AmbienceEngine();
    return engineRef.current;
  }, []);

  const startSound = useCallback(
    async (levels?: Levels) => {
      const nextLevels = levels ?? vault.vault.settings.levels;
      setSoundBusy(true);
      try {
        await ensureEngine().start(nextLevels, vault.vault.settings.masterVolume);
        setLiveLevels(nextLevels);
        setSoundEnabled(true);
      } catch (error) {
        toast(error instanceof Error ? error.message : "The room would not wake.", "error");
      } finally {
        setSoundBusy(false);
      }
    },
    [ensureEngine, toast, vault.vault.settings.levels, vault.vault.settings.masterVolume],
  );

  const stopSound = useCallback(() => {
    engineRef.current?.stop();
    setSoundEnabled(false);
  }, []);

  const toggleSound = useCallback(() => {
    if (soundEnabled) stopSound();
    else void startSound();
  }, [soundEnabled, startSound, stopSound]);

  const applyLevels = useCallback((levels: Levels) => {
    setLiveLevels(levels);
    if (engineRef.current?.isRunning()) engineRef.current.setLevels(levels);
  }, []);

  useEffect(() => {
    if (soundEnabled) engineRef.current?.setVolume(vault.vault.settings.masterVolume);
  }, [soundEnabled, vault.vault.settings.masterVolume]);

  useEffect(() => {
    if (soundEnabled && !engineRef.current?.isRunning()) return;
    if (soundEnabled) engineRef.current?.setLevels(liveLevels);
  }, [liveLevels, soundEnabled]);

  useEffect(
    () => () => {
      engineRef.current?.stop();
      engineRef.current = null;
    },
    [],
  );

  const makeVigil = useCallback((result: TimerResult): Vigil => {
    const base = {
      id: result.sessionId,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      plannedMin: Math.max(1, Math.round(result.plannedSec / 60)),
      focusedSec: result.focusedSec,
      completed: result.completed,
      intention: result.intention,
      ambience: result.ambience,
    };
    const seal = buildSeal(base);
    const transmission = composeTransmission({
      ...base,
      seal,
      minutes: base.plannedMin,
    });
    return {
      ...base,
      levels: result.levels,
      seal,
      transmission,
      ...(result.clockDriftMs !== null ? { clockDriftMs: result.clockDriftMs } : {}),
    };
  }, []);

  const handleAutoComplete = useCallback(
    (result: TimerResult) => {
      const vigil = makeVigil(result);
      vault.addVigil(vigil);
      setReturnId(vigil.id);
      stopSound();
      toast("The vigil is kept. Something returned with it.", "success");
      navigate("/return");
    },
    [makeVigil, navigate, stopSound, toast, vault],
  );

  const timer = useVigilTimer(handleAutoComplete);

  const beginVigil = useCallback(
    (setup: VigilSetup) => {
      if (timer.snapshot) return;
      timer.start(beginSnapshot(setup));
      setReturnId(null);
      void startSound(setup.levels);
    },
    [startSound, timer],
  );

  const releaseVigil = useCallback(() => {
    const result = timer.finish(false);
    if (!result) return;
    const vigil = makeVigil(result);
    vault.addVigil(vigil);
    stopSound();
    toast("You released the vigil. Its sigil stays unfinished.", "info");
    navigate("/crypt");
  }, [makeVigil, navigate, stopSound, timer, toast, vault]);

  const openReturn = useCallback(
    (vigilId: string) => {
      setReturnId(vigilId);
      navigate("/return");
    },
    [navigate],
  );

  const clearReturn = useCallback(
    (next: Route = "/crypt") => {
      setReturnId(null);
      navigate(next);
    },
    [navigate],
  );

  const returnVigil = useMemo(
    () => (returnId ? vault.vault.vigils.find((vigil) => vigil.id === returnId) ?? null : null),
    [returnId, vault.vault.vigils],
  );

  const stats = useMemo(() => computeStats(vault.vault.vigils), [vault.vault.vigils]);

  useEffect(() => {
    document.documentElement.classList.toggle("in-ritual", timer.snapshot !== null);
  }, [timer.snapshot]);

  useEffect(() => {
    if (timer.snapshot?.phase === "running") return;
    if (route === "/vigil" && returnVigil) navigate("/return");
  }, [navigate, returnVigil, route, timer.snapshot?.phase]);

  const value = useMemo<AppContextValue>(
    () => ({
      route,
      navigate,
      vault,
      settings: vault.vault.settings,
      stats,
      wallet,
      timer,
      returnVigil,
      beginVigil,
      releaseVigil,
      openReturn,
      clearReturn,
      soundEnabled,
      soundBusy,
      toggleSound,
      startSound,
      stopSound,
      applyLevels,
      toast,
      toasts,
      dismissToast,
      confirm,
    }),
    [
      applyLevels,
      beginVigil,
      clearReturn,
      confirm,
      dismissToast,
      navigate,
      openReturn,
      releaseVigil,
      returnVigil,
      route,
      soundBusy,
      soundEnabled,
      startSound,
      stats,
      stopSound,
      timer,
      toast,
      toasts,
      toggleSound,
      vault,
      wallet,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog state={pendingConfirm} onResolve={settleConfirm} />
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider.");
  return context;
}
