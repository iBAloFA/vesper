import { describe, expect, it } from "vitest";
import { computeStats, todayFocusCount } from "../src/lib/stats";
import { makeAttestation, makeSolanaAttestation, makeVigil } from "./fixtures";

function at(day: number, hour = 12): number {
  return new Date(2026, 0, day, hour, 0, 0).getTime();
}

function completed(day: number, minutes: number, overrides = {}) {
  return makeVigil({
    id: `vigil-${day}-${minutes}`,
    startedAt: at(day),
    endedAt: at(day, 13),
    plannedMin: minutes,
    focusedSec: minutes * 60,
    completed: true,
    ...overrides,
  });
}

describe("computeStats", () => {
  it("returns zeroed stats for an empty vault", () => {
    const stats = computeStats([], at(10));
    expect(stats).toMatchObject({
      completed: 0,
      released: 0,
      totalMinutes: 0,
      focusToday: 0,
      currentStreak: 0,
      bestStreak: 0,
      sealed: 0,
      sigils: 0,
    });
    expect(stats.last7).toHaveLength(7);
    expect(stats.last7[6]!.label).toBe("Today");
  });

  it("counts only completed time toward totals and streaks", () => {
    const stats = computeStats(
      [
        completed(10, 25),
        completed(9, 30),
        completed(8, 15),
        makeVigil({
          id: "released",
          startedAt: at(10),
          plannedMin: 45,
          focusedSec: 600,
          completed: false,
        }),
      ],
      at(10),
    );
    expect(stats.completed).toBe(3);
    expect(stats.released).toBe(1);
    expect(stats.totalMinutes).toBe(70);
    expect(stats.focusToday).toBe(25);
    expect(stats.currentStreak).toBe(3);
    expect(stats.bestStreak).toBe(3);
    expect(stats.sigils).toBe(3);
  });

  it("keeps a streak alive from yesterday when today is empty", () => {
    const stats = computeStats([completed(9, 20), completed(8, 20)], at(10, 9));
    expect(stats.currentStreak).toBe(2);
    expect(stats.focusToday).toBe(0);
  });

  it("breaks a stale streak", () => {
    const stats = computeStats([completed(5, 20), completed(4, 20)], at(10));
    expect(stats.currentStreak).toBe(0);
    expect(stats.bestStreak).toBe(2);
  });

  it("reports the best historical run across gaps", () => {
    const stats = computeStats(
      [completed(1, 10), completed(2, 10), completed(3, 10), completed(5, 10), completed(6, 10)],
      at(10),
    );
    expect(stats.bestStreak).toBe(3);
    expect(stats.currentStreak).toBe(0);
  });

  it("counts a sealed record by attestation presence, not verification", () => {
    const stats = computeStats(
      [
        completed(10, 25, { attestation: makeAttestation() }),
        completed(9, 25),
        completed(8, 25, { completed: false }),
      ],
      at(10),
    );
    expect(stats.sealed).toBe(1);
    expect(stats.sigils).toBe(2);
  });

  it("counts a Solana seal as a sealed sigil", () => {
    const stats = computeStats(
      [completed(10, 25, { solana: { sigil: "ab".repeat(32), attestation: makeSolanaAttestation() } })],
      at(10),
    );
    expect(stats.sealed).toBe(1);
  });

  it("builds a seven-day window ending today", () => {
    const stats = computeStats([completed(10, 25), completed(8, 15)], at(10, 23));
    expect(stats.last7).toHaveLength(7);
    expect(stats.last7.map((day) => day.key)).toEqual([
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
    ]);
    expect(stats.last7[6]).toMatchObject({ label: "Today", minutes: 25 });
    expect(stats.last7[4]).toMatchObject({ minutes: 15 });
    expect(stats.last7[5]).toMatchObject({ minutes: 0 });
    expect(stats.last7[0]).toMatchObject({ minutes: 0 });
  });

  it("rounds seconds to whole minutes", () => {
    const stats = computeStats(
      [
        completed(10, 1, { focusedSec: 90 }),
        completed(10, 1, { id: "second", focusedSec: 30 }),
      ],
      at(10),
    );
    expect(stats.totalMinutes).toBe(2);
    expect(stats.focusToday).toBe(2);
  });
});

describe("todayFocusCount", () => {
  it("counts completed vigils started today only", () => {
    const vigils = [
      completed(10, 25),
      completed(10, 5),
      completed(9, 25),
      makeVigil({ id: "released", startedAt: at(10), completed: false }),
    ];
    expect(todayFocusCount(vigils, at(10, 20))).toBe(2);
  });
});
