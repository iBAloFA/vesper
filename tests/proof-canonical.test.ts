import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSeal, verifySeal } from "../src/lib/attestation";
import {
  MESSAGE_HEADER,
  buildMessageV2,
  clampDuration,
  computeSealV2,
  parseMessageV2,
  sealMatches,
  sealPreimage,
  sigilIdFor,
  type CanonicalMessageInput,
  type SealableRecord,
} from "../src/lib/proof/canonical";
import type { Vigil } from "../src/lib/types";

const SIGIL = "ab".repeat(32);
const SEAL = "cd".repeat(32);
const RECORD: SealableRecord = {
  startedAt: 1768035600000,
  endedAt: 1768037100000,
  plannedMin: 25,
  focusedSec: 1500,
  completed: true,
  intention: "Finish the chapter",
  ambience: "hollow",
};

const MESSAGE_INPUT: CanonicalMessageInput = {
  cluster: "devnet",
  program: null,
  sigil: SIGIL,
  keeper: "11111111111111111111111111111111",
  startedAt: String(RECORD.startedAt),
  durationMin: 25,
  focusedSec: 1500,
  outcome: "completed",
  clockDriftMs: null,
  seal: SEAL,
};

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("canonical v2 message", () => {
  it("is byte-for-byte the designed layout", () => {
    const expected = [
      "vesper.vigil.v2",
      "cluster=devnet",
      "program=unminted",
      `sigil=${SIGIL}`,
      "keeper=11111111111111111111111111111111",
      "startedAt=1768035600000",
      "durationMin=25",
      "focusedSec=1500",
      "outcome=completed",
      "clockDriftMs=unknown",
      `seal=${SEAL}`,
    ].join("\n");
    expect(buildMessageV2(MESSAGE_INPUT)).toBe(expected);
    expect(buildMessageV2(MESSAGE_INPUT).endsWith("\n")).toBe(false);
  });

  it("round-trips through the parser and rejects non-canonical text", () => {
    const message = buildMessageV2(MESSAGE_INPUT);
    expect(parseMessageV2(message)).toEqual(MESSAGE_INPUT);
    expect(parseMessageV2(`${message}\n`)).toBeNull();
    expect(parseMessageV2(message.replace(MESSAGE_HEADER, "vesper.vigil.v1"))).toBeNull();
    expect(parseMessageV2(message.replace("durationMin=25", "durationMin=025"))).toBeNull();
    expect(parseMessageV2(message.replace("program=unminted", "program="))).toBeNull();

    const edited = parseMessageV2(message.replace("durationMin=25", "durationMin=30"));
    expect(edited).toEqual({ ...MESSAGE_INPUT, durationMin: 30 });
    expect(edited).not.toEqual(MESSAGE_INPUT);
  });

  it("refuses non-decimal start times and out-of-range durations", () => {
    expect(() => buildMessageV2({ ...MESSAGE_INPUT, startedAt: "1768035600000.5" })).toThrow();
    expect(() => buildMessageV2({ ...MESSAGE_INPUT, startedAt: "-1" })).toThrow();
    expect(() => buildMessageV2({ ...MESSAGE_INPUT, durationMin: 0 })).toThrow();
    expect(() => buildMessageV2({ ...MESSAGE_INPUT, durationMin: 601 })).toThrow();
    expect(() => buildMessageV2({ ...MESSAGE_INPUT, program: " " })).toThrow();
    expect(() => buildMessageV2({ ...MESSAGE_INPUT, sigil: SIGIL.toUpperCase() })).toThrow();
  });

  it("clamps durations to 1–600", () => {
    expect(clampDuration(0)).toBe(1);
    expect(clampDuration(-5)).toBe(1);
    expect(clampDuration(601)).toBe(600);
    expect(clampDuration(25)).toBe(25);
  });
});

describe("seal v2", () => {
  it("is SHA-256 over the prefixed record string", () => {
    expect(sealPreimage(RECORD, SIGIL, null)).toBe(
      [
        "vesper.seal.v2",
        SIGIL,
        "1768035600000",
        "1768037100000",
        "25",
        "1500",
        "completed",
        "Finish the chapter",
        "hollow",
        "unknown",
      ].join("|"),
    );
  });

  it("matches an independent SHA-256 implementation", async () => {
    expect(await computeSealV2(RECORD, SIGIL, null)).toBe(sha256(sealPreimage(RECORD, SIGIL, null)));
    expect(await computeSealV2(RECORD, SIGIL, null)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("binds every covered field", async () => {
    const base = await computeSealV2(RECORD, SIGIL, 0);
    const variants: Array<[string, SealableRecord, number | null]> = [
      ["intention", { ...RECORD, intention: "Finish another chapter" }, 0],
      ["ambience", { ...RECORD, ambience: "chapel" }, 0],
      ["outcome", { ...RECORD, completed: false }, 0],
      ["focused", { ...RECORD, focusedSec: 1499 }, 0],
      ["ended", { ...RECORD, endedAt: RECORD.endedAt + 1 }, 0],
      ["planned", { ...RECORD, plannedMin: 26 }, 0],
      ["drift", RECORD, 2000],
      ["sigil", RECORD, 0],
    ];
    const seals = new Set([base]);
    for (const [label, record, drift] of variants) {
      const seal = await computeSealV2(
        record,
        label === "sigil" ? "ef".repeat(32) : SIGIL,
        drift,
      );
      expect(seals.has(seal)).toBe(false);
      seals.add(seal);
    }
  });

  it("detects an altered record and rejects malformed seals", async () => {
    const seal = await computeSealV2(RECORD, SIGIL, null);
    expect(await sealMatches(RECORD, SIGIL, null, seal)).toBe(true);
    expect(await sealMatches({ ...RECORD, focusedSec: 0 }, SIGIL, null, seal)).toBe(false);
    expect(await sealMatches(RECORD, SIGIL, null, "not-a-seal")).toBe(false);
    expect(await sealMatches(RECORD, SIGIL, 1, seal)).toBe(false);
  });

  it("derives a stable 32-byte sigil id from the vigil id", async () => {
    expect(await sigilIdFor("vigil-1")).toBe(sha256("vesper.sigil.v2|vigil-1"));
    expect(await sigilIdFor("vigil-1")).toBe(await sigilIdFor("vigil-1"));
    expect(await sigilIdFor("vigil-2")).not.toBe(await sigilIdFor("vigil-1"));
    await expect(sigilIdFor("")).rejects.toThrow();
  });

  it("leaves v1 seals and records verifiable", () => {
    const v1 = {
      id: "vigil-1",
      ...RECORD,
      seal: buildSeal({ id: "vigil-1", ...RECORD }),
    } as Vigil;
    expect(v1.seal).toMatch(/^0x[0-9a-f]{64}$/);
    expect(verifySeal(v1)).toBe(true);
    expect(verifySeal({ ...v1, intention: "Edited after the fact" })).toBe(false);
  });
});
