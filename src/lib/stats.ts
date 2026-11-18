import { dayKey, dayLabel, dayOrdinal } from "./time";
import type { Vigil } from "./types";

export interface DailyFocus {
  key: string;
  label: string;
  timestamp: number;
  minutes: number;
  vigils: number;
}

export interface FocusStats {
  completed: number;
  released: number;
  totalMinutes: number;
  focusToday: number;
  currentStreak: number;
  bestStreak: number;
  sealed: number;
  sigils: number;
  last7: DailyFocus[];
}

export function computeStats(vigils: readonly Vigil[], now = Date.now()): FocusStats {
  const completed = vigils.filter((vigil) => vigil.completed);
  const released = vigils.filter((vigil) => !vigil.completed);
  const totalSeconds = completed.reduce((sum, vigil) => sum + vigil.focusedSec, 0);
  const todayOrdinal = dayOrdinal(now);

  const dayTotals = new Map<number, { seconds: number; count: number }>();
  for (const vigil of completed) {
    const ordinal = dayOrdinal(vigil.startedAt);
    const entry = dayTotals.get(ordinal) ?? { seconds: 0, count: 0 };
    entry.seconds += vigil.focusedSec;
    entry.count += 1;
    dayTotals.set(ordinal, entry);
  }

  let currentStreak = 0;
  const streakStart = dayTotals.has(todayOrdinal)
    ? todayOrdinal
    : dayTotals.has(todayOrdinal - 1)
      ? todayOrdinal - 1
      : null;
  if (streakStart !== null) {
    let cursor = streakStart;
    while (dayTotals.has(cursor)) {
      currentStreak += 1;
      cursor -= 1;
    }
  }

  const ordinals = [...dayTotals.keys()].sort((a, b) => a - b);
  let bestStreak = 0;
  let run = 0;
  let previous: number | null = null;
  for (const ordinal of ordinals) {
    run = previous !== null && ordinal === previous + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = ordinal;
  }

  const last7: DailyFocus[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const ordinal = todayOrdinal - offset;
    const timestamp = new Date(now);
    timestamp.setDate(timestamp.getDate() - offset);
    const entry = dayTotals.get(ordinal);
    last7.push({
      key: dayKey(timestamp.getTime()),
      label: offset === 0 ? "Today" : dayLabel(timestamp.getTime()),
      timestamp: timestamp.getTime(),
      minutes: entry ? Math.round(entry.seconds / 60) : 0,
      vigils: entry?.count ?? 0,
    });
  }

  return {
    completed: completed.length,
    released: released.length,
    totalMinutes: Math.round(totalSeconds / 60),
    focusToday: Math.round((dayTotals.get(todayOrdinal)?.seconds ?? 0) / 60),
    currentStreak,
    bestStreak,
    sealed: completed.filter((vigil) => Boolean(vigil.attestation)).length,
    sigils: completed.length,
    last7,
  };
}

export function todayFocusCount(vigils: readonly Vigil[], now = Date.now()): number {
  const today = dayKey(now);
  return vigils.filter((vigil) => vigil.completed && dayKey(vigil.startedAt) === today).length;
}
