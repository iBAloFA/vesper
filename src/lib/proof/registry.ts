import bs58 from "bs58";

/** Anchor account layouts for the deployed `vesper_sigil` program,
 * mirroring .kiro/specs/proof-of-focus-solana/design.md. Discriminators are
 * SHA-256("account:<Name>")[0..8] and are asserted in the tests. */
export const SIGIL_ACCOUNT_LENGTH = 221;
export const ART_HEADER_LENGTH = 12;
export const MAX_ART_BYTES = 16 * 1024;

export const SIGIL_DISCRIMINATOR_HEX = "4fe56e6db469f854";
export const ART_DISCRIMINATOR_HEX = "52ee5fb954e4f7cb";

export const OUTCOME_KEPT = 0;
export const OUTCOME_RELEASED = 1;

const SIGIL_ID_START = 8;
const KEEPER_START = 40;
const SEAL_START = 72;
const MESSAGE_HASH_START = 104;
const ART_HASH_START = 136;
const ART_LEN_AT = 168;
const DURATION_AT = 172;
const FOCUSED_AT = 174;
const OUTCOME_AT = 178;
const MINTED_AT = 179;
const REVOKED_AT = 187;
const MINT_START = 188;

export interface SigilRecord {
  /** 32 bytes of lowercase hex: the id the art and the message are bound to. */
  sigilId: string;
  keeper: string;
  seal: string;
  messageHash: string;
  artHash: string;
  artLen: number;
  durationMin: number;
  focusedSec: number;
  outcome: typeof OUTCOME_KEPT | typeof OUTCOME_RELEASED;
  /** Unix seconds, as the cluster saw them. */
  mintedAt: number;
  revoked: boolean;
  mint: string;
}

export interface RpcAccount {
  owner: string;
  data: Uint8Array;
}

function bytesOf(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

const SIGIL_DISCRIMINATOR = bytesOf(SIGIL_DISCRIMINATOR_HEX);
const ART_DISCRIMINATOR = bytesOf(ART_DISCRIMINATOR_HEX);

function hasDiscriminator(data: Uint8Array, discriminator: Uint8Array): boolean {
  return data.length >= 8 && discriminator.every((byte, index) => data[index] === byte);
}

function hexOf(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function viewOf(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

export function normalizeSigilId(value: string): string | null {
  const hex = value.trim().toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

export function parseSigilAccount(data: Uint8Array): SigilRecord | null {
  if (data.length !== SIGIL_ACCOUNT_LENGTH) return null;
  if (!hasDiscriminator(data, SIGIL_DISCRIMINATOR)) return null;
  const view = viewOf(data);
  const minted = view.getBigInt64(MINTED_AT, true);
  if (minted < 0n || minted > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const outcome = data[OUTCOME_AT];
  if (outcome !== OUTCOME_KEPT && outcome !== OUTCOME_RELEASED) return null;
  return {
    sigilId: hexOf(data.subarray(SIGIL_ID_START, KEEPER_START)),
    keeper: bs58.encode(data.subarray(KEEPER_START, SEAL_START)),
    seal: hexOf(data.subarray(SEAL_START, MESSAGE_HASH_START)),
    messageHash: hexOf(data.subarray(MESSAGE_HASH_START, ART_HASH_START)),
    artHash: hexOf(data.subarray(ART_HASH_START, ART_LEN_AT)),
    artLen: view.getUint32(ART_LEN_AT, true),
    durationMin: view.getUint16(DURATION_AT, true),
    focusedSec: view.getUint32(FOCUSED_AT, true),
    outcome,
    mintedAt: Number(minted),
    revoked: data[REVOKED_AT] !== 0,
    mint: bs58.encode(data.subarray(MINT_START, SIGIL_ACCOUNT_LENGTH - 1)),
  };
}

/** The `Art` account is Anchor's discriminator plus a length-prefixed Vec:
 * the SVG bytes follow the 12-byte header exactly as they were written. */
export function parseArtAccount(data: Uint8Array): Uint8Array | null {
  if (!hasDiscriminator(data, ART_DISCRIMINATOR)) return null;
  if (data.length < ART_HEADER_LENGTH) return null;
  const length = viewOf(data).getUint32(8, true);
  if (length === 0 || length > MAX_ART_BYTES) return null;
  if (ART_HEADER_LENGTH + length > data.length) return null;
  return data.slice(ART_HEADER_LENGTH, ART_HEADER_LENGTH + length);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This environment cannot compute SHA-256.");
  return new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(bytes)));
}

export async function artMatches(record: SigilRecord, art: Uint8Array): Promise<boolean> {
  if (art.length !== record.artLen) return false;
  return hexOf(await sha256(art)) === record.artHash;
}

export async function deriveSigilAddresses(
  program: string,
  sigilHex: string,
): Promise<{ sigil: string; art: string; sigilBump: number; artBump: number }> {
  const id = normalizeSigilId(sigilHex);
  if (!id) throw new Error("The sigil must be 32 bytes of hex.");
  const { PublicKey } = await import("@solana/web3.js");
  const programKey = new PublicKey(program);
  const bytes = bytesOf(id);
  const [sigil, sigilBump] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("sigil"), bytes],
    programKey,
  );
  const [art, artBump] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("art"), bytes],
    programKey,
  );
  return { sigil: sigil.toBase58(), art: art.toBase58(), sigilBump, artBump };
}

/** Reads one account straight from JSON-RPC so the viewer and the CLI share
 * the same decoding path. Returns null when the cluster knows no such account. */
export async function fetchAccountData(rpc: string, address: string): Promise<RpcAccount | null> {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [address, { encoding: "base64", commitment: "confirmed" }],
    }),
  });
  if (!response.ok) throw new Error(`The cluster answered ${response.status}.`);
  const payload = (await response.json()) as {
    error?: { message?: string };
    result?: { value: { owner: string; data: [string, string] } | null };
  };
  if (payload.error) throw new Error(payload.error.message ?? "The cluster refused the request.");
  const value = payload.result?.value;
  if (!value) return null;
  const binary = atob(value.data[0]);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
  return { owner: value.owner, data };
}

export function recordJson(record: SigilRecord): string {
  return JSON.stringify(record, null, 2);
}

export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] as number);
  }
  return btoa(binary);
}

/** A wallet-renderable document for one sigil: the token metadata this program
 * records is a URI only, so the art travels as an embedded data URI here. */
export function sigilMetadata(record: SigilRecord, art: Uint8Array): Record<string, unknown> {
  const outcome = record.outcome === OUTCOME_RELEASED ? "released" : "kept";
  return {
    name: "Vesper Sigil",
    symbol: "VSPR",
    description:
      "A sigil kept by a Vesper vigil. The art and the record live on the cluster; the attestation is what a keeper signed, and it verifies offline.",
    image: `data:image/svg+xml;base64,${base64(art)}`,
    external_url: `https://ibalofa.github.io/vesper/#/sigil/${record.sigilId}`,
    attributes: [
      { trait_type: "Sigil", value: record.sigilId },
      { trait_type: "Keeper", value: record.keeper },
      { trait_type: "Mint", value: record.mint },
      { trait_type: "Sealed", value: new Date(record.mintedAt * 1000).toISOString() },
      { trait_type: "Duration", value: `${record.durationMin} min` },
      { trait_type: "Focused", value: `${record.focusedSec} s` },
      { trait_type: "Outcome", value: outcome },
      { trait_type: "Seal", value: record.seal },
      { trait_type: "Art hash", value: record.artHash },
    ],
  };
}
