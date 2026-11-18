import { describe, expect, it } from "vitest";
import {
  autoFinishAt,
  beginSnapshot,
  clampMinutes,
  finishSnapshot,
  hasExpired,
  initialSetup,
  minutesLabel,
  pauseSnapshot,
  remainingSeconds,
  resumeSnapshot,
  type VigilSetup,
} from "../src/lib/timer";
import { levelsFor } from "../src/lib/types";
import { defaultSettings } from "../src/lib/storage";

const START = 1_767_000_000_000;
const MINUTE = 60_000;

function setup(overrides: Partial<VigilSetup> = {}): VigilSetup {
  return {
    intention: "  Finish   the chapter  ",
    minutes: 25,
    customMinutes: 20,
    ambience: "hollow",
    levels: levelsFor("hollow"),
    ...overrides,
  };
}

describe("clampMinutes", () => {
  it("clamps to the custom range and rounds", () => {
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(999)).toBe(180);
    expect(clampMinutes(24.6)).toBe(25);
    expect(clampMinutes(1)).toBe(1);
    expect(clampMinutes(180)).toBe(180);
  });

  it("falls back to 25 for non-finite values", () => {
    expect(clampMinutes(Number.NaN)).toBe(25);
    expect(clampMinutes(Number.POSITIVE_INFINITY)).toBe(25);
  });
});

describe("initialSetup", () => {
  it("uses the default ambience and cloned levels", () => {
    const settings = defaultSettings();
    const result = initialSetup(settings);
    expect(result.ambience).toBe("hollow");
    expect(result.minutes).toBe(25);
    expect(result.levels).toEqual(settings.levels);
    expect(result.levels).not.toBe(settings.levels);
  });
});

describe("beginSnapshot", () => {
  it("anchors the session to the wall clock", () => {
    const snapshot = beginSnapshot(setup(), START);
    expect(snapshot.phase).toBe("running");
    expect(snapshot.plannedSec).toBe(25 * 60);
    expect(snapshot.remainingSec).toBe(25 * 60);
    expect(snapshot.startedAt).toBe(START);
    expect(snapshot.targetEnd).toBe(START + 25 * MINUTE);
    expect(snapshot.intention).toBe("Finish the chapter");
    expect(snapshot.sessionId.length).toBeGreaterThan(0);
  });

  it("clamps the requested duration and copies levels", () => {
    const levels = levelsFor("chapel");
    const snapshot = beginSnapshot(setup({ minutes: 999, levels }), START);
    expect(snapshot.plannedSec).toBe(180 * 60);
    expect(snapshot.levels).toEqual(levels);
    expect(snapshot.levels).not.toBe(levels);
  });

  it("truncates a long intention to 80 characters", () => {
    const snapshot = beginSnapshot(setup({ intention: "x".repeat(120) }), START);
    expect(snapshot.intention).toHaveLength(80);
  });
});

describe("remainingSeconds", () => {
  it("derives running time from targetEnd, not an interval", () => {
    const snapshot = beginSnapshot(setup(), START);
    expect(remainingSeconds(snapshot, START + 10_000)).toBe(1490);
    expect(remainingSeconds(snapshot, START + 10_500)).toBe(1490);
    expect(remainingSeconds(snapshot, START + 25 * MINUTE)).toBe(0);
    expect(remainingSeconds(snapshot, START + 99 * MINUTE)).toBe(0);
  });

  it("uses the stored remainder while paused", () => {
    const paused = pauseSnapshot(beginSnapshot(setup(), START), START + 5 * MINUTE);
    expect(remainingSeconds(paused, START + 60 * MINUTE)).toBe(1200);
  });
});

describe("pause and resume", () => {
  it("captures the remainder and clears the target", () => {
    const paused = pauseSnapshot(beginSnapshot(setup(), START), START + 5 * MINUTE);
    expect(paused.phase).toBe("paused");
    expect(paused.remainingSec).toBe(1200);
    expect(paused.targetEnd).toBeNull();
    expect(pauseSnapshot(paused, START + 6 * MINUTE)).toBe(paused);
  });

  it("resumes from the captured remainder", () => {
    const paused = pauseSnapshot(beginSnapshot(setup(), START), START + 5 * MINUTE);
    const resumed = resumeSnapshot(paused, START + 60 * MINUTE);
    expect(resumed.phase).toBe("running");
    expect(resumed.remainingSec).toBe(1200);
    expect(resumed.targetEnd).toBe(START + 60 * MINUTE + 1200 * 1000);
    expect(resumeSnapshot(resumed, START + 61 * MINUTE)).toBe(resumed);
  });

  it("never resumes with less than one second", () => {
    const expired = { ...pauseSnapshot(beginSnapshot(setup({ minutes: 5 }), START), START + 5 * MINUTE), remainingSec: 0 };
    const resumed = resumeSnapshot(expired, START + 6 * MINUTE);
    expect(resumed.remainingSec).toBe(1);
    expect(resumed.targetEnd).toBe(START + 6 * MINUTE + 1000);
  });
});

describe("finishSnapshot", () => {
  it("credits the full plan when completed, even if finished early", () => {
    const snapshot = pauseSnapshot(beginSnapshot(setup(), START), START + 5 * MINUTE);
    const result = finishSnapshot(snapshot, true, START + 5 * MINUTE);
    expect(result.completed).toBe(true);
    expect(result.focusedSec).toBe(1500);
    expect(result.endedAt).toBe(START + 5 * MINUTE);
    expect(result.intention).toBe("Finish the chapter");
  });

  it("credits elapsed time only when released early", () => {
    const snapshot = pauseSnapshot(beginSnapshot(setup(), START), START + 5 * MINUTE);
    const result = finishSnapshot(snapshot, false, START + 5 * MINUTE);
    expect(result.completed).toBe(false);
    expect(result.focusedSec).toBe(300);
  });

  it("credits the full plan when released after expiry", () => {
    const snapshot = beginSnapshot(setup({ minutes: 5 }), START);
    const result = finishSnapshot(snapshot, false, START + 6 * MINUTE);
    expect(result.focusedSec).toBe(300);
  });

  it("keeps focused time within the plan", () => {
    const snapshot = beginSnapshot(setup({ minutes: 5 }), START);
    const result = finishSnapshot(snapshot, false, START - MINUTE);
    expect(result.focusedSec).toBe(0);
  });
});

describe("autoFinishAt", () => {
  it("returns the target for a running session only", () => {
    const snapshot = beginSnapshot(setup(), START);
    expect(autoFinishAt(snapshot)).toBe(snapshot.targetEnd);
    expect(autoFinishAt(pauseSnapshot(snapshot, START + MINUTE))).toBeNull();
  });
});

describe("hasExpired", () => {
  it("is true only for a running session past its target", () => {
    const snapshot = beginSnapshot(setup(), START);
    expect(hasExpired(snapshot, START + 10 * MINUTE)).toBe(false);
    expect(hasExpired(snapshot, START + 25 * MINUTE)).toBe(true);
    expect(hasExpired(pauseSnapshot(snapshot, START + 10 * MINUTE), START + 99 * MINUTE)).toBe(false);
  });
});

describe("minutesLabel", () => {
  it("uses singular for one minute", () => {
    expect(minutesLabel(1)).toBe("1 minute");
    expect(minutesLabel(2)).toBe("2 minutes");
  });
});
