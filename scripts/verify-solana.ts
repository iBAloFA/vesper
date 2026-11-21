import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  deriveSigilAddresses,
  parseSigilAccount as parseRegistrySigil,
  SIGIL_DISCRIMINATOR_HEX,
} from "../src/lib/proof/registry";

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

const SIGIL_DISCRIMINATOR = Uint8Array.from(
  SIGIL_DISCRIMINATOR_HEX.match(/../g) ?? [],
  (pair) => Number.parseInt(pair, 16),
);

export function sigilDiscriminator(): Uint8Array {
  return new Uint8Array(SIGIL_DISCRIMINATOR);
}

export function ledgerDiscriminator(): Uint8Array {
  return new Uint8Array(createHash("sha256").update("account:Ledger", "utf8").digest().subarray(0, 8));
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function parseSigilAccount(data: Uint8Array): SigilAccountState | null {
  const record = parseRegistrySigil(data);
  return record ? { keeper: record.keeper, mint: record.mint, revoked: record.revoked } : null;
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
  const derived = await deriveSigilAddresses(programId, sigilHex);
  return { address: derived.sigil, bump: derived.sigilBump };
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
