import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildMessageV2 } from "../src/lib/proof/canonical";
import {
  ART_CHUNK_BYTES,
  artForSigil,
  encodeMintData,
  encodeWriteArtData,
  hexToBytes,
  instructionDiscriminator,
  messageField,
  planMint,
} from "../src/lib/proof/solanaMint";
import type { SolanaAttestationV2 } from "../src/lib/types";

const SIGIL = "ab".repeat(32);
const SEAL = "cd".repeat(32);

function message(overrides: { durationMin?: number; outcome?: "completed" | "released" } = {}) {
  return buildMessageV2({
    cluster: "devnet",
    program: null,
    sigil: SIGIL,
    keeper: "11111111111111111111111111111111",
    startedAt: "1768035600000",
    durationMin: overrides.durationMin ?? 25,
    focusedSec: 1500,
    outcome: overrides.outcome ?? "completed",
    clockDriftMs: null,
    seal: SEAL,
  });
}

function attestation(overrides: { message?: string; seal?: string } = {}): SolanaAttestationV2 {
  return {
    v: 2,
    app: "vesper",
    chain: "solana",
    cluster: "devnet",
    program: null,
    message: overrides.message ?? message(),
    seal: overrides.seal ?? SEAL,
    record: { endedAt: "1768037100000", intention: "Finish the chapter", ambience: "hollow" },
    signature: "2".repeat(64),
    keeper: "11111111111111111111111111111111",
  };
}

function sha256(bytes: string): number[] {
  return [...createHash("sha256").update(bytes, "utf8").digest()];
}

describe("hexToBytes", () => {
  it("decodes 32 bytes and refuses anything else", () => {
    expect([...hexToBytes("00".repeat(32))]).toEqual(new Array(32).fill(0));
    expect(() => hexToBytes("AB".repeat(32))).toThrow(/lowercase hex/);
    expect(() => hexToBytes("ab")).toThrow(/lowercase hex/);
  });
});

describe("messageField", () => {
  it("reads a line and refuses a missing one", () => {
    expect(messageField(message(), "outcome")).toBe("completed");
    expect(() => messageField(message(), "seal2")).toThrow(/no seal2/);
  });
});

describe("planMint", () => {
  it("reads the sealed fields and hashes the art and message", async () => {
    const art = artForSigil(SIGIL);
    const plan = await planMint(attestation(), art);
    expect([...plan.sigilId]).toEqual([...hexToBytes(SIGIL)]);
    expect([...plan.seal]).toEqual([...hexToBytes(SEAL)]);
    expect(plan.durationMin).toBe(25);
    expect(plan.focusedSec).toBe(1500);
    expect(plan.outcome).toBe(0);
    expect([...plan.messageHash]).toEqual(sha256(message()));
    expect([...plan.artHash]).toEqual(sha256(art));
    expect(art.length).toBeLessThan(16 * 1024);
  });

  it("labels a released vigil with the released outcome", async () => {
    const plan = await planMint(attestation({ message: message({ outcome: "released" }) }), "svg");
    expect(plan.outcome).toBe(1);
  });

  it("refuses a seal the message does not carry", async () => {
    await expect(
      planMint(attestation({ seal: "ef".repeat(32) }), "svg"),
    ).rejects.toThrow(/not the one the message carries/);
  });

  it("refuses a duration outside 1–600", async () => {
    const edited = message().replace("durationMin=25", "durationMin=0");
    await expect(planMint(attestation({ message: edited }), "svg")).rejects.toThrow(
      /outside 1–600/,
    );
  });

  it("refuses empty art", async () => {
    await expect(planMint(attestation(), "")).rejects.toThrow(/between 1 byte and 16 KiB/);
  });
});

describe("encodeMintData", () => {
  it("lays the arguments out in the program's order", async () => {
    const plan = await planMint(attestation(), "svg");
    const data = encodeMintData(await instructionDiscriminator("mint"), plan);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(data.length).toBe(8 + 139);
    expect([...data.slice(8, 40)]).toEqual([...hexToBytes(SIGIL)]);
    expect([...data.slice(40, 72)]).toEqual([...hexToBytes(SEAL)]);
    expect([...data.slice(72, 104)]).toEqual(sha256(message()));
    expect(view.getUint16(104, true)).toBe(25);
    expect(view.getUint32(106, true)).toBe(1500);
    expect(view.getUint8(110)).toBe(0);
    expect([...data.slice(111, 143)]).toEqual(sha256("svg"));
    expect(view.getUint32(143, true)).toBe(3);
  });

  it("keeps the art out of the mint instruction", async () => {
    const art = artForSigil(SIGIL);
    const plan = await planMint(attestation(), art);
    const data = encodeMintData(await instructionDiscriminator("mint"), plan);
    expect(data.length).toBe(147);
    expect(new TextDecoder().decode(data)).not.toContain("<svg");
  });
});

describe("encodeWriteArtData", () => {
  it("lays the chunk out with its offset", async () => {
    const chunk = new TextEncoder().encode("<svg/>");
    const data = encodeWriteArtData(
      await instructionDiscriminator("write_art"),
      hexToBytes(SIGIL),
      700,
      chunk,
    );
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(data.length).toBe(8 + 32 + 4 + 4 + 6);
    expect([...data.slice(8, 40)]).toEqual([...hexToBytes(SIGIL)]);
    expect(view.getUint32(40, true)).toBe(700);
    expect(view.getUint32(44, true)).toBe(6);
    expect(new TextDecoder().decode(data.slice(48))).toBe("<svg/>");
  });

  it("keeps each chunk inside the transaction limit", () => {
    expect(ART_CHUNK_BYTES).toBeLessThan(1000);
    expect(artForSigil(SIGIL).length).toBeGreaterThan(ART_CHUNK_BYTES);
  });
});

describe("instructionDiscriminator", () => {
  it("matches Anchor's naming", async () => {
    const expected = createHash("sha256").update("global:mint", "utf8").digest().subarray(0, 8);
    expect([...(await instructionDiscriminator("mint"))]).toEqual([...expected]);
  });
});

describe("artForSigil", () => {
  it("is deterministic and shaped like an SVG", () => {
    expect(artForSigil(SIGIL)).toBe(artForSigil(SIGIL));
    expect(artForSigil(SIGIL)).toMatch(/^<svg /);
    expect(artForSigil(SIGIL)).not.toBe(artForSigil("ab".repeat(31) + "ac"));
  });
});
