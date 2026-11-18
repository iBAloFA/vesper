import {
  levelsFor,
  type AmbienceId,
  type Levels,
  type Settings,
  type TimerResult,
  type TimerSnapshot,
} from "./types";

export const PLAN_MINUTES = [5, 15, 25, 45] as const;
export const CUSTOM_MINUTES_MIN = 1;
export const CUSTOM_MINUTES_MAX = 180;

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 25;
  return Math.min(CUSTOM_MINUTES_MAX, Math.max(CUSTOM_MINUTES_MIN, Math.round(value)));
}

export function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `vigil-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface VigilSetup {
  intention: string;
  minutes: number;
  customMinutes: number;
  ambience: AmbienceId;
  levels: Levels;
}

export function initialSetup(settings: Settings): VigilSetup {
  const ambience = settings.defaultAmbience ?? "hollow";
  return {
    intention: "",
    minutes: 25,
    customMinutes: 20,
    ambience,
    levels: settings.levels ? { ...settings.levels } : levelsFor(ambience),
  };
}

export function beginSnapshot(setup: VigilSetup, now = Date.now()): TimerSnapshot {
  const plannedSec = clampMinutes(setup.minutes) * 60;
  return {
    phase: "running",
    plannedSec,
    remainingSec: plannedSec,
    targetEnd: now + plannedSec * 1000,
    startedAt: now,
    sessionId: createSessionId(),
    intention: setup.intention.replace(/\s+/g, " ").trim().slice(0, 80),
    ambience: setup.ambience,
    levels: { ...setup.levels },
  };
}

export function remainingSeconds(snapshot: TimerSnapshot, now = Date.now()): number {
  if (snapshot.phase === "paused") return Math.max(0, snapshot.remainingSec);
  const target = snapshot.targetEnd ?? now;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

export function hasExpired(snapshot: TimerSnapshot, now = Date.now()): boolean {
  return snapshot.phase === "running" && remainingSeconds(snapshot, now) <= 0;
}

export function pauseSnapshot(snapshot: TimerSnapshot, now = Date.now()): TimerSnapshot {
  if (snapshot.phase === "paused") return snapshot;
  return {
    ...snapshot,
    phase: "paused",
    remainingSec: remainingSeconds(snapshot, now),
    targetEnd: null,
  };
}

export function resumeSnapshot(snapshot: TimerSnapshot, now = Date.now()): TimerSnapshot {
  if (snapshot.phase === "running") return snapshot;
  const remaining = Math.max(1, snapshot.remainingSec);
  return {
    ...snapshot,
    phase: "running",
    remainingSec: remaining,
    targetEnd: now + remaining * 1000,
  };
}

export function finishSnapshot(
  snapshot: TimerSnapshot,
  completed: boolean,
  now = Date.now(),
): TimerResult {
  const left = remainingSeconds(snapshot, now);
  const focusedSec = completed
    ? snapshot.plannedSec
    : Math.max(0, Math.min(snapshot.plannedSec, snapshot.plannedSec - left));
  return {
    sessionId: snapshot.sessionId,
    plannedSec: snapshot.plannedSec,
    focusedSec: Math.max(0, focusedSec),
    startedAt: snapshot.startedAt,
    endedAt: now,
    completed,
    intention: snapshot.intention,
    ambience: snapshot.ambience,
    levels: snapshot.levels,
  };
}

export function autoFinishAt(snapshot: TimerSnapshot): number | null {
  if (snapshot.phase === "running" && snapshot.targetEnd) return snapshot.targetEnd;
  return null;
}

export function minutesLabel(minutes: number): string {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}
