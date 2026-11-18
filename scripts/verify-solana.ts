import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

/** Anchor account layout for `Sigil`, mirroring .kiro/specs/proof-of-focus-solana/design.md. */
const SIGIL_ACCOUNT_LENGTH = 217;
const KEEPER_START = 40;
const KEEPER_END = 72;
const REVOKED_AT = 183;
const MINT_START = 184;
const MINT_END = 216;

export interface SigilAccountState {
  keeper: string;
  mint: string;
  revoked: boolean;
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
