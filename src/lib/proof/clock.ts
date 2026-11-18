export const CLOCK_DRIFT_BUDGET_MS = 2_000;

export interface DriftClock {
  wall(): number;
  mono(): number;
}

export interface DriftState {
  wallStart: number;
  monoStart: number;
  maxDriftMs: number;
}

const systemClock: DriftClock = { wall: () => Date.now(), mono: () => performance.now() };

export function beginDrift(clock: DriftClock = systemClock): DriftState {
  return { wallStart: clock.wall(), monoStart: clock.mono(), maxDriftMs: 0 };
}

export function sampleDrift(state: DriftState, clock: DriftClock = systemClock): DriftState {
  const drifted = (clock.wall() - state.wallStart) - (clock.mono() - state.monoStart);
  return { ...state, maxDriftMs: Math.max(state.maxDriftMs, Math.abs(Math.round(drifted))) };
}

export function clockDriftMs(state: DriftState | null): number | null {
  return state ? state.maxDriftMs : null;
}

export function clockMoved(driftMs: number | null): boolean {
  return driftMs !== null && driftMs > CLOCK_DRIFT_BUDGET_MS;
}

export function driftLabel(driftMs: number | null): string {
  if (driftMs === null) return "clock not sampled";
  if (!clockMoved(driftMs)) return "clock steady";
  // Anything over the 2 s budget rounds to at least 2, so the unit is always plural.
  return `clock moved by ${Math.round(driftMs / 1_000)} seconds`;
}
