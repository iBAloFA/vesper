import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

/** Anchor account layout for `Sigil`, mirroring .kiro/specs/proof-of-focus-solana/design.md. */
const SIGIL_ACCOUNT_LENGTH = 221;
const KEEPER_START = 40;
const KEEPER_END = 72;
const REVOKED_AT = 187;
const MINT_START = 188;
const MINT_END = 220;

/** Anchor account layout for `Ledger`: discriminant, seq u64, head [u8;32], bump. */
const LEDGER_ACCOUNT_LENGTH = 49;
const LEDGER_SEQ_START = 8;
const LEDGER_HEAD_START = 16;
const LEDGER_HEAD_END = 48;

export interface SigilAccountState {
  keeper: string;
  mint: string;
  revoked: boolean;
}

export interface LedgerAccountState {
  seq: number;
  head: string;
}

export interface AccountInfoLike {
  data: Uint8Array;
}

export interface ConnectionLike {
  getAccountInfo(address: PublicKey): Promise<AccountInfoLike | null>;
}

export function sigilDiscriminator(): Uint8Array {
  return new Uint8Array(createHash("sha256").update("account:Sigil", "utf8").digest().subarray(0, 8));
}

export function ledgerDiscriminator(): Uint8Array {
  return new Uint8Array(createHash("sha256").update("account:Ledger", "utf8").digest().subarray(0, 8));
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function parseSigilAccount(data: Uint8Array): SigilAccountState | null {
  if (data.length !== SIGIL_ACCOUNT_LENGTH) return null;
  if (!sameBytes(data.subarray(0, 8), sigilDiscriminator())) return null;
  return {
    keeper: bs58.encode(data.subarray(KEEPER_START, KEEPER_END)),
    revoked: data[REVOKED_AT] !== 0,
    mint: bs58.encode(data.subarray(MINT_START, MINT_END)),
  };
}

export async function lookupSigil(
  connection: ConnectionLike,
  sigilAddress: string,
): Promise<SigilAccountState | null | "missing"> {
  const account = await connection.getAccountInfo(new PublicKey(sigilAddress));
  if (!account) return "missing";
  return parseSigilAccount(account.data);
}

export async function deriveSigilAddress(
  programId: string,
  sigilHex: string,
): Promise<{ address: string; bump: number }> {
  const [address, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("sigil"), Buffer.from(sigilHex, "hex")],
    new PublicKey(programId),
  );
  return { address: address.toBase58(), bump };
}

export function parseLedgerAccount(data: Uint8Array): LedgerAccountState | null {
  if (data.length !== LEDGER_ACCOUNT_LENGTH) return null;
  if (!sameBytes(data.subarray(0, 8), ledgerDiscriminator())) return null;
  let seq = 0n;
  for (let index = LEDGER_SEQ_START + 7; index >= LEDGER_SEQ_START; index -= 1) {
    seq = (seq << 8n) | BigInt(data[index]);
  }
  if (seq > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const head = Array.from(data.subarray(LEDGER_HEAD_START, LEDGER_HEAD_END), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return { seq: Number(seq), head };
}

export async function lookupLedger(
  connection: ConnectionLike,
  programId: string,
): Promise<LedgerAccountState | null | "missing"> {
  const [address] = await PublicKey.findProgramAddress(
    [Buffer.from("ledger")],
    new PublicKey(programId),
  );
  const account = await connection.getAccountInfo(address);
  if (!account) return "missing";
  return parseLedgerAccount(account.data);
}
