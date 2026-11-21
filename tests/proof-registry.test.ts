import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { createKeeper } from "../src/lib/proof/keeper";
import {
  ART_DISCRIMINATOR_HEX,
  ART_HEADER_LENGTH,
  MAX_ART_BYTES,
  OUTCOME_KEPT,
  OUTCOME_RELEASED,
  SIGIL_ACCOUNT_LENGTH,
  SIGIL_DISCRIMINATOR_HEX,
  artMatches,
  deriveSigilAddresses,
  normalizeSigilId,
  parseArtAccount,
  parseSigilAccount,
  sigilMetadata,
  type SigilRecord,
} from "../src/lib/proof/registry";

const PROGRAM = "94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX";
const SIGIL_ID = "9e94619d".padEnd(64, "0");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="60"/></svg>';
const ART = new TextEncoder().encode(SVG);

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

interface SigilOptions {
  outcome?: number;
  mintedAt?: bigint;
  revoked?: boolean;
  artLen?: number;
  artHash?: string;
}

function sigilAccount(options: SigilOptions = {}): Uint8Array {
  const keeper = createKeeper().publicKey;
  const mint = createKeeper().publicKey;
  const data = new Uint8Array(SIGIL_ACCOUNT_LENGTH);
  const view = new DataView(data.buffer);
  data.set(hexToBytes(SIGIL_DISCRIMINATOR_HEX), 0);
  data.set(hexToBytes(SIGIL_ID), 8);
  data.set(keeper, 40);
  data.set(hexToBytes("11".repeat(32)), 72);
  data.set(hexToBytes("22".repeat(32)), 104);
  data.set(hexToBytes(options.artHash ?? sha256Hex(ART)), 136);
  view.setUint32(168, options.artLen ?? ART.length, true);
  view.setUint16(172, 25, true);
  view.setUint32(174, 1498, true);
  data[178] = options.outcome ?? OUTCOME_KEPT;
  view.setBigInt64(179, options.mintedAt ?? 1_763_700_000n, true);
  data[187] = options.revoked ? 1 : 0;
  data.set(mint, 188);
  data[220] = 254;
  return data;
}

function artAccount(bytes: Uint8Array): Uint8Array {
  const data = new Uint8Array(ART_HEADER_LENGTH + bytes.length);
  data.set(hexToBytes(ART_DISCRIMINATOR_HEX), 0);
  new DataView(data.buffer).setUint32(8, bytes.length, true);
  data.set(bytes, ART_HEADER_LENGTH);
  return data;
}

function record(options: SigilOptions = {}): SigilRecord {
  const parsed = parseSigilAccount(sigilAccount(options));
  if (!parsed) throw new Error("fixture failed to parse");
  return parsed;
}

describe("discriminators", () => {
  it("are SHA-256('account:Name') truncated to eight bytes", () => {
    const sigil = createHash("sha256").update("account:Sigil").digest("hex").slice(0, 16);
    const art = createHash("sha256").update("account:Art").digest("hex").slice(0, 16);
    expect(SIGIL_DISCRIMINATOR_HEX).toBe(sigil);
    expect(ART_DISCRIMINATOR_HEX).toBe(art);
  });
});

describe("normalizeSigilId", () => {
  it("accepts bare and 0x-prefixed hex in any case", () => {
    expect(normalizeSigilId(SIGIL_ID)).toBe(SIGIL_ID);
    expect(normalizeSigilId(`0x${"AB".repeat(32)}`)).toBe("ab".repeat(32));
    expect(normalizeSigilId(`  ${SIGIL_ID}  `)).toBe(SIGIL_ID);
  });

  it("refuses anything that is not 32 bytes of hex", () => {
    expect(normalizeSigilId("")).toBeNull();
    expect(normalizeSigilId("ab".repeat(31))).toBeNull();
    expect(normalizeSigilId("zz".repeat(32))).toBeNull();
  });
});

describe("parseSigilAccount", () => {
  it("reads every field from the 221-byte layout", () => {
    const data = sigilAccount({ outcome: OUTCOME_RELEASED, mintedAt: 1_763_700_123n, revoked: true });
    const parsed = parseSigilAccount(data);
    expect(parsed).toMatchObject({
      sigilId: SIGIL_ID,
      seal: "11".repeat(32),
      messageHash: "22".repeat(32),
      artHash: sha256Hex(ART),
      artLen: ART.length,
      durationMin: 25,
      focusedSec: 1498,
      outcome: OUTCOME_RELEASED,
      mintedAt: 1_763_700_123,
      revoked: true,
    });
    expect(parsed!.keeper).toBeTruthy();
    expect(parsed!.mint).toBeTruthy();
    expect(parsed!.keeper).not.toBe(parsed!.mint);
  });

  it("rejects the wrong length, a foreign discriminator, an impossible outcome and a negative date", () => {
    expect(parseSigilAccount(new Uint8Array(SIGIL_ACCOUNT_LENGTH - 1))).toBeNull();
    expect(parseSigilAccount(new Uint8Array(SIGIL_ACCOUNT_LENGTH + 1))).toBeNull();
    const foreign = sigilAccount();
    foreign[0] ^= 0xff;
    expect(parseSigilAccount(foreign)).toBeNull();
    expect(parseSigilAccount(sigilAccount({ outcome: 2 }))).toBeNull();
    expect(parseSigilAccount(sigilAccount({ mintedAt: -1n }))).toBeNull();
  });
});

describe("parseArtAccount", () => {
  it("returns exactly the bytes the record hashes", () => {
    expect(parseArtAccount(artAccount(ART))).toEqual(ART);
  });

  it("rejects a foreign discriminator, an empty or overlong length, and truncation", () => {
    const foreign = artAccount(ART);
    foreign[0] ^= 0xff;
    expect(parseArtAccount(foreign)).toBeNull();
    expect(parseArtAccount(new Uint8Array(ART_HEADER_LENGTH))).toBeNull();
    const empty = artAccount(ART);
    new DataView(empty.buffer).setUint32(8, 0, true);
    expect(parseArtAccount(empty)).toBeNull();
    const huge = artAccount(ART);
    new DataView(huge.buffer).setUint32(8, MAX_ART_BYTES + 1, true);
    expect(parseArtAccount(huge)).toBeNull();
    expect(parseArtAccount(artAccount(ART).subarray(0, ART_HEADER_LENGTH + 5))).toBeNull();
  });
});

describe("artMatches", () => {
  it("accepts the exact bytes and nothing else", async () => {
    expect(await artMatches(record(), ART)).toBe(true);
    expect(await artMatches(record(), new Uint8Array([...ART, 32]))).toBe(false);
    const altered = new Uint8Array(ART);
    altered[12] ^= 0x01;
    expect(await artMatches(record(), altered)).toBe(false);
    expect(await artMatches(record({ artLen: ART.length + 1 }), ART)).toBe(false);
  });
});

describe("deriveSigilAddresses", () => {
  it("matches the program seeds the on-chain code uses", async () => {
    const derived = await deriveSigilAddresses(PROGRAM, SIGIL_ID);
    const program = new PublicKey(PROGRAM);
    const id = hexToBytes(SIGIL_ID);
    const [sigil, sigilBump] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode("sigil"), id],
      program,
    );
    const [art, artBump] = await PublicKey.findProgramAddress(
      [new TextEncoder().encode("art"), id],
      program,
    );
    expect(derived).toEqual({
      sigil: sigil.toBase58(),
      art: art.toBase58(),
      sigilBump,
      artBump,
    });
  });

  it("accepts 0x-prefixed ids and refuses anything else", async () => {
    const plain = await deriveSigilAddresses(PROGRAM, SIGIL_ID);
    expect(await deriveSigilAddresses(PROGRAM, `0x${SIGIL_ID.toUpperCase()}`)).toEqual(plain);
    await expect(deriveSigilAddresses(PROGRAM, "not-a-sigil")).rejects.toThrow(/32 bytes of hex/);
  });
});

describe("sigilMetadata", () => {
  it("names the token, embeds the art and points at this viewer", () => {
    const metadata = sigilMetadata(record({ outcome: OUTCOME_RELEASED }), ART) as {
      name: string;
      symbol: string;
      image: string;
      external_url: string;
      attributes: Array<{ trait_type: string; value: string }>;
    };
    expect(metadata.name).toBe("Vesper Sigil");
    expect(metadata.symbol).toBe("VSPR");
    expect(metadata.image).toBe(`data:image/svg+xml;base64,${Buffer.from(ART).toString("base64")}`);
    expect(metadata.external_url).toBe(`https://ibalofa.github.io/vesper/#/sigil/${SIGIL_ID}`);
    const traits = Object.fromEntries(metadata.attributes.map((a) => [a.trait_type, a.value]));
    expect(traits.Outcome).toBe("released");
    expect(traits.Duration).toBe("25 min");
    expect(traits["Art hash"]).toBe(sha256Hex(ART));
  });
});
