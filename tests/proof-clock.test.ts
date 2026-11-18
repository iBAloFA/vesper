import { describe, expect, it } from "vitest";
import {
  beginDrift,
  clockDriftMs,
  clockMoved,
  driftLabel,
  sampleDrift,
  type DriftClock,
} from "../src/lib/proof/clock";

function fakeClock(wall: number, mono: number) {
  let currentWall = wall;
  let currentMono = mono;
  const clock: DriftClock = { wall: () => currentWall, mono: () => currentMono };
  return {
    clock,
    advance(wallBy: number, monoBy: number) {
      currentWall += wallBy;
      currentMono += monoBy;
    },
  };
}

describe("clock evidence", () => {
  it("records no drift when wall and monotonic time agree", () => {
    const { clock, advance } = fakeClock(1_000, 0);
    let state = beginDrift(clock);
    advance(60_000, 60_000);
    state = sampleDrift(state, clock);
    expect(clockDriftMs(state)).toBe(0);
    expect(clockMoved(clockDriftMs(state))).toBe(false);
  });

  it("records the largest absolute deviation, not the last one", () => {
    const { clock, advance } = fakeClock(0, 0);
    const state = beginDrift(clock);
    advance(3_600_000, 1_000);
    const afterSleep = sampleDrift(state, clock);
    advance(5_000, 6_000);
    const settled = sampleDrift(afterSleep, clock);
    expect(clockDriftMs(afterSleep)).toBe(3_599_000);
    expect(clockDriftMs(settled)).toBe(3_599_000);
  });

  it("treats a backwards wall clock as drift", () => {
    const { clock, advance } = fakeClock(10_000, 0);
    const state = beginDrift(clock);
    advance(-4_000, 1_000);
    expect(clockDriftMs(sampleDrift(state, clock))).toBe(5_000);
  });

  it("rounds sub-millisecond noise and reports null before sampling", () => {
    const { clock, advance } = fakeClock(0, 0);
    const state = beginDrift(clock);
    advance(1_000.4, 0);
    expect(clockDriftMs(sampleDrift(state, clock))).toBe(1_000);
    expect(clockDriftMs(null)).toBeNull();
    expect(driftLabel(null)).toBe("clock not sampled");
  });

  it("labels the budget in seconds, never as proof of time", () => {
    expect(clockMoved(2_000)).toBe(false);
    expect(clockMoved(2_001)).toBe(true);
    expect(driftLabel(0)).toBe("clock steady");
    expect(driftLabel(1_000)).toBe("clock steady");
    expect(driftLabel(2_001)).toBe("clock moved by 2 seconds");
    expect(driftLabel(61_000)).toBe("clock moved by 61 seconds");
    expect(driftLabel(3_599_000)).toBe("clock moved by 3599 seconds");
  });
});
