import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPersistedTimer,
  loadPersistedTimer,
  savePersistedTimer,
} from "../lib/storage";
import {
  finishSnapshot,
  hasExpired,
  pauseSnapshot,
  remainingSeconds,
  resumeSnapshot,
} from "../lib/timer";
import type { TimerResult, TimerSnapshot } from "../lib/types";

function restoredSnapshot(): TimerSnapshot | null {
  const snapshot = loadPersistedTimer();
  if (!snapshot) return null;
  if (snapshot.phase === "running" && hasExpired(snapshot)) {
    clearPersistedTimer();
    return null;
  }
  return snapshot;
}

export interface VigilTimerApi {
  snapshot: TimerSnapshot | null;
  remaining: number;
  start: (snapshot: TimerSnapshot) => void;
  pause: () => void;
  resume: () => void;
  finish: (completed: boolean) => TimerResult | null;
  abandon: () => void;
}

export function useVigilTimer(onComplete: (result: TimerResult) => void): VigilTimerApi {
  const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(() => restoredSnapshot());
  const [remaining, setRemaining] = useState(() =>
    snapshot ? remainingSeconds(snapshot) : 0,
  );
  const snapshotRef = useRef<TimerSnapshot | null>(snapshot);
  const onCompleteRef = useRef(onComplete);
  const finishingRef = useRef<string | null>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    snapshotRef.current = snapshot;
    if (snapshot) savePersistedTimer(snapshot);
    else clearPersistedTimer();
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    if (snapshot.phase !== "running") {
      setRemaining(snapshot.remainingSec);
      return;
    }
    const tick = () => {
      const current = snapshotRef.current;
      if (!current || current.phase !== "running") return;
      const left = remainingSeconds(current);
      setRemaining(left);
      if (left <= 0 && finishingRef.current !== current.sessionId) {
        finishingRef.current = current.sessionId;
        const result = finishSnapshot(current, true, Date.now());
        setSnapshot(null);
        onCompleteRef.current(result);
        finishingRef.current = null;
      }
    };
    tick();
    const interval = window.setInterval(tick, 500);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [snapshot]);

  const start = useCallback((next: TimerSnapshot) => {
    setSnapshot(next);
    setRemaining(next.plannedSec);
  }, []);

  const pause = useCallback(() => {
    setSnapshot((current) => (current ? pauseSnapshot(current) : current));
  }, []);

  const resume = useCallback(() => {
    setSnapshot((current) => (current ? resumeSnapshot(current) : current));
  }, []);

  const finish = useCallback((completed: boolean) => {
    const current = snapshotRef.current;
    if (!current) return null;
    const result = finishSnapshot(current, completed, Date.now());
    setSnapshot(null);
    return result;
  }, []);

  const abandon = useCallback(() => {
    setSnapshot(null);
  }, []);

  return { snapshot, remaining, start, pause, resume, finish, abandon };
}
