import type { AmbienceId } from "../types";

export const MESSAGE_HEADER = "vesper.vigil.v2";
const SEAL_PREFIX = "vesper.seal.v2";
const SIGIL_PREFIX = "vesper.sigil.v2";
const HEX_32 = /^[0-9a-f]{64}$/;
const DIGITS = /^\d+$/;

export type VigilOutcome = "completed" | "released";

export interface SealableRecord {
  startedAt: number;
  endedAt: number;
  plannedMin: number;
  focusedSec: number;
  completed: boolean;
  intention: string;
  ambience: AmbienceId;
}

export interface CanonicalMessageInput {
  cluster: string;
  program: string | null;
  sigil: string;
  keeper: string;
  startedAt: string;
  durationMin: number;
  focusedSec: number;
  outcome: VigilOutcome;
  clockDriftMs: number | null;
  seal: string;
}

function decimal(value: number, field: string): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative whole number.`);
  }
  return String(value);
}

function requireHex32(value: string, field: string): void {
  if (!HEX_32.test(value)) throw new Error(`${field} must be 32 bytes of lowercase hex.`);
}

export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) throw new Error("The duration is not a number.");
  return Math.min(600, Math.max(1, Math.trunc(minutes)));
}

export function outcomeOf(completed: boolean): VigilOutcome {
  return completed ? "completed" : "released";
}

export function driftValue(clockDriftMs: number | null): string {
  if (clockDriftMs === null) return "unknown";
  if (!Number.isSafeInteger(clockDriftMs)) {
    throw new Error("The clock drift must be a whole number of milliseconds.");
  }
  return String(clockDriftMs);
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This environment cannot compute SHA-256.");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Stable 32-byte identifier for the sigil PDA: bound to the vigil id, not its content. */
export async function sigilIdFor(vigilId: string): Promise<string> {
  if (!vigilId) throw new Error("A vigil id is required to derive a sigil.");
  return sha256Hex(`${SIGIL_PREFIX}|${vigilId}`);
}

export function sealPreimage(
  record: SealableRecord,
  sigil: string,
  clockDriftMs: number | null,
): string {
  requireHex32(sigil, "sigil");
  return [
    SEAL_PREFIX,
    sigil,
    decimal(record.startedAt, "startedAt"),
    decimal(record.endedAt, "endedAt"),
    String(clampDuration(record.plannedMin)),
    decimal(record.focusedSec, "focusedSec"),
    outcomeOf(record.completed),
    record.intention,
    record.ambience,
    driftValue(clockDriftMs),
  ].join("|");
}

export function computeSealV2(
  record: SealableRecord,
  sigil: string,
  clockDriftMs: number | null,
): Promise<string> {
  return sha256Hex(sealPreimage(record, sigil, clockDriftMs));
}

export async function sealMatches(
  record: SealableRecord,
  sigil: string,
  clockDriftMs: number | null,
  expectedSeal: string,
): Promise<boolean> {
  if (!HEX_32.test(expectedSeal)) return false;
  return (await computeSealV2(record, sigil, clockDriftMs)) === expectedSeal;
}

export function buildMessageV2(input: CanonicalMessageInput): string {
  requireHex32(input.sigil, "sigil");
  requireHex32(input.seal, "seal");
  if (!input.cluster.trim()) throw new Error("The cluster is empty.");
  if (input.program !== null && !input.program.trim()) throw new Error("The program is empty.");
  if (!input.keeper.trim()) throw new Error("The keeper is empty.");
  if (!DIGITS.test(input.startedAt)) {
    throw new Error("startedAt must be a digit-only decimal string.");
  }
  if (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 600) {
    throw new Error("durationMin must be between 1 and 600.");
  }
  if (!Number.isSafeInteger(input.focusedSec) || input.focusedSec < 0) {
    throw new Error("focusedSec must be a non-negative whole number.");
  }
  if (input.outcome !== "completed" && input.outcome !== "released") {
    throw new Error("The outcome must be completed or released.");
  }
  return [
    MESSAGE_HEADER,
    `cluster=${input.cluster}`,
    `program=${input.program ?? "unminted"}`,
    `sigil=${input.sigil}`,
    `keeper=${input.keeper}`,
    `startedAt=${input.startedAt}`,
    `durationMin=${input.durationMin}`,
    `focusedSec=${input.focusedSec}`,
    `outcome=${input.outcome}`,
    `clockDriftMs=${driftValue(input.clockDriftMs)}`,
    `seal=${input.seal}`,
  ].join("\n");
}

export function parseMessageV2(text: string): CanonicalMessageInput | null {
  const lines = text.split("\n");
  if (lines.length !== 11 || lines[0] !== MESSAGE_HEADER) return null;
  const prefixes = [
    "cluster=",
    "program=",
    "sigil=",
    "keeper=",
    "startedAt=",
    "durationMin=",
    "focusedSec=",
    "outcome=",
    "clockDriftMs=",
    "seal=",
  ];
  const values: string[] = [];
  for (let index = 0; index < prefixes.length; index += 1) {
    const line = lines[index + 1];
    if (!line.startsWith(prefixes[index])) return null;
    values.push(line.slice(prefixes[index].length));
  }
  const drift = values[8];
  const message: CanonicalMessageInput = {
    cluster: values[0],
    program: values[1] === "unminted" ? null : values[1],
    sigil: values[2],
    keeper: values[3],
    startedAt: values[4],
    durationMin: Number(values[5]),
    focusedSec: Number(values[6]),
    outcome: values[7] as VigilOutcome,
    clockDriftMs: drift === "unknown" ? null : Number(drift),
    seal: values[9],
  };
  try {
    return buildMessageV2(message) === text ? message : null;
  } catch {
    return null;
  }
}
