import bs58 from "bs58";
import { sigilSvg } from "../sigil";
import type { SolanaAttestationV2 } from "../types";
import type { SolanaKeeper } from "./keeper";

/** Token-2022 and its associated-token program, both stable mainnet ids. */
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

export const OUTCOME_COMPLETED = 0;
export const OUTCOME_RELEASED = 1;

const HEX_32 = /^[0-9a-f]{64}$/;

export interface MintPlan {
  sigilId: Uint8Array;
  seal: Uint8Array;
  messageHash: Uint8Array;
  durationMin: number;
  focusedSec: number;
  outcome: 0 | 1;
  art: string;
  artHash: Uint8Array;
}

export interface MintResult {
  mint: string;
  tx: string;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!HEX_32.test(hex)) throw new Error("Expected 32 bytes of lowercase hex.");
  const out = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser cannot compute SHA-256.");
  return new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(bytes)));
}

export async function instructionDiscriminator(name: string): Promise<Uint8Array> {
  const digest = await sha256(new TextEncoder().encode(`global:${name}`));
  return digest.slice(0, 8);
}

export function messageField(message: string, key: string): string {
  const line = message.split("\n").find((candidate) => candidate.startsWith(`${key}=`));
  if (line === undefined) throw new Error(`The sealed message has no ${key}.`);
  return line.slice(key.length + 1);
}

export function artForSigil(sigil: string): string {
  return sigilSvg(sigil);
}

export async function planMint(
  attestation: SolanaAttestationV2,
  art: string,
): Promise<MintPlan> {
  const durationMin = Number(messageField(attestation.message, "durationMin"));
  const focusedSec = Number(messageField(attestation.message, "focusedSec"));
  const outcomeText = messageField(attestation.message, "outcome");
  if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 600) {
    throw new Error("The sealed duration is outside 1–600 minutes.");
  }
  if (!Number.isInteger(focusedSec) || focusedSec < 0) {
    throw new Error("The sealed focus time is not a whole number of seconds.");
  }
  if (outcomeText !== "completed" && outcomeText !== "released") {
    throw new Error("The sealed outcome is neither completed nor released.");
  }
  const artBytes = new TextEncoder().encode(art);
  if (artBytes.length === 0 || artBytes.length > 16 * 1024) {
    throw new Error("The art must be between 1 byte and 16 KiB.");
  }
  const sealedSeal = messageField(attestation.message, "seal");
  if (sealedSeal !== attestation.seal) {
    throw new Error("The attestation's seal is not the one the message carries.");
  }
  return {
    sigilId: hexToBytes(messageField(attestation.message, "sigil")),
    seal: hexToBytes(attestation.seal),
    messageHash: await sha256(new TextEncoder().encode(attestation.message)),
    durationMin,
    focusedSec,
    outcome: outcomeText === "completed" ? OUTCOME_COMPLETED : OUTCOME_RELEASED,
    art,
    artHash: await sha256(artBytes),
  };
}

/** The SVG does not fit in a 1232-byte transaction, so the app writes it in
 * chunks of this size after `mint` has reserved the `Art` account. */
export const ART_CHUNK_BYTES = 700;

export function encodeMintData(discriminator: Uint8Array, plan: MintPlan): Uint8Array {
  const data = new Uint8Array(8 + 139);
  const view = new DataView(data.buffer);
  let at = 0;
  data.set(discriminator, at);
  at += 8;
  data.set(plan.sigilId, at);
  at += 32;
  data.set(plan.seal, at);
  at += 32;
  data.set(plan.messageHash, at);
  at += 32;
  view.setUint16(at, plan.durationMin, true);
  at += 2;
  view.setUint32(at, plan.focusedSec, true);
  at += 4;
  view.setUint8(at, plan.outcome);
  at += 1;
  data.set(plan.artHash, at);
  at += 32;
  view.setUint32(at, new TextEncoder().encode(plan.art).length, true);
  return data;
}

export function encodeWriteArtData(
  discriminator: Uint8Array,
  sigilId: Uint8Array,
  offset: number,
  chunk: Uint8Array,
): Uint8Array {
  const data = new Uint8Array(8 + 32 + 4 + 4 + chunk.length);
  const view = new DataView(data.buffer);
  let at = 0;
  data.set(discriminator, at);
  at += 8;
  data.set(sigilId, at);
  at += 32;
  view.setUint32(at, offset, true);
  at += 4;
  view.setUint32(at, chunk.length, true);
  at += 4;
  data.set(chunk, at);
  return data;
}

export function encodeRevokeData(
  discriminator: Uint8Array,
  sigilId: Uint8Array,
  seq: number,
  prev: Uint8Array,
  head: Uint8Array,
): Uint8Array {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error("The ledger sequence must start at 1.");
  const data = new Uint8Array(8 + 32 + 8 + 32 + 32);
  const view = new DataView(data.buffer);
  let at = 0;
  data.set(discriminator, at);
  at += 8;
  data.set(sigilId, at);
  at += 32;
  view.setBigUint64(at, BigInt(seq), true);
  at += 8;
  data.set(prev, at);
  at += 32;
  data.set(head, at);
  return data;
}

async function rpc<T>(endpoint: string, body: unknown): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`The cluster answered ${response.status}.`);
  const payload = (await response.json()) as { error?: { message?: string }; result?: T };
  if (payload.error) throw new Error(payload.error.message ?? "The cluster refused the request.");
  return payload.result as T;
}

export async function keeperBalance(rpcUrl: string, address: string): Promise<number> {
  const result = await rpc<{ value: number } | null>(rpcUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "getBalance",
    params: [address, { commitment: "confirmed" }],
  });
  return (result?.value ?? 0) / 1_000_000_000;
}

export async function requestAirdrop(rpcUrl: string, address: string): Promise<string> {
  const signature = await rpc<string>(rpcUrl, {
    jsonrpc: "2.0",
    id: 1,
    method: "requestAirdrop",
    params: [address, 1_000_000_000],
  });
  return signature;
}

async function waitForSignature(rpcUrl: string, signature: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    const status = await rpc<{ value: Array<{ confirmationStatus?: string; err: unknown } | null> }>(
      rpcUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[signature], { searchTransactionHistory: true }],
      },
    );
    const entry = status.value[0];
    if (entry) {
      if (entry.err) throw new Error("The cluster rejected the transaction.");
      if (entry.confirmationStatus === "confirmed" || entry.confirmationStatus === "finalized") {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error("The cluster did not confirm the transaction in time.");
}

export interface MintParams {
  attestation: SolanaAttestationV2;
  keeper: SolanaKeeper;
  art: string;
  program: string;
  rpc: string;
  cluster: string;
}

const DEVNET_ONLY = "Vesper v0.2 mints on devnet only.";

export async function mintSigil(params: MintParams): Promise<MintResult> {
  if (params.cluster !== "devnet") throw new Error(DEVNET_ONLY);
  if (params.attestation.program !== params.program) {
    throw new Error(
      "This record was sealed without naming this program, so it cannot be minted to it.",
    );
  }
  const plan = await planMint(params.attestation, params.art);

  const {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    TransactionInstruction,
    Ed25519Program,
    SystemProgram,
  } = await import("@solana/web3.js");

  const connection = new Connection(params.rpc, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS) {
    throw new Error("This RPC is not devnet, so nothing was minted. Point VITE_SOLANA_RPC at devnet.");
  }

  const program = new PublicKey(params.program);
  const keeperKey = await Keypair.fromSecretKey(params.keeper.secretKey);
  const mintKeypair = await Keypair.generate();
  const tokenProgram = new PublicKey(TOKEN_2022_PROGRAM);
  const ataProgram = new PublicKey(ASSOCIATED_TOKEN_PROGRAM);
  const [sigilPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("sigil"), plan.sigilId],
    program,
  );
  const [artPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("art"), plan.sigilId],
    program,
  );
  const [tokenAccount] = await PublicKey.findProgramAddress(
    [keeperKey.publicKey.toBytes(), tokenProgram.toBytes(), mintKeypair.publicKey.toBytes()],
    ataProgram,
  );

  const verify = Ed25519Program.createInstructionWithPublicKey({
    publicKey: params.keeper.publicKey,
    message: new TextEncoder().encode(params.attestation.message),
    signature: bs58.decode(params.attestation.signature),
  });

  const mintIx = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: keeperKey.publicKey, isSigner: true, isWritable: true },
      { pubkey: sigilPda, isSigner: false, isWritable: true },
      { pubkey: artPda, isSigner: false, isWritable: true },
      { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: ataProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey("Sysvar1nstructions1111111111111111111111111"),
        isSigner: false,
        isWritable: false,
      },
    ],
    data: encodeMintData(await instructionDiscriminator("mint"), plan),
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction();
  transaction.add(verify, mintIx);
  transaction.feePayer = keeperKey.publicKey;
  transaction.recentBlockhash = blockhash;
  await transaction.sign(keeperKey, mintKeypair);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(await transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3n,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/insufficient funds|no record of a prior credit/i.test(message)) {
      throw new Error("The keeper has no devnet SOL for the fee. Fund it, then mint again.", {
        cause: error,
      });
    }
    throw new Error(
      `The cluster refused the mint: ${message || "no reason was given"}. Nothing was minted.`,
      { cause: error },
    );
  }
  await waitForSignature(params.rpc, signature);

  const art = new TextEncoder().encode(plan.art);
  const writeDiscriminator = await instructionDiscriminator("write_art");
  for (let offset = 0; offset < art.length; offset += ART_CHUNK_BYTES) {
    const chunk = art.slice(offset, offset + ART_CHUNK_BYTES);
    const writeIx = new TransactionInstruction({
      programId: program,
      keys: [
        { pubkey: keeperKey.publicKey, isSigner: true, isWritable: true },
        { pubkey: sigilPda, isSigner: false, isWritable: false },
        { pubkey: artPda, isSigner: false, isWritable: true },
      ],
      data: encodeWriteArtData(writeDiscriminator, plan.sigilId, offset, chunk),
    });
    const { blockhash: nextBlockhash } = await connection.getLatestBlockhash("confirmed");
    const writeTx = new Transaction();
    writeTx.add(writeIx);
    writeTx.feePayer = keeperKey.publicKey;
    writeTx.recentBlockhash = nextBlockhash;
    await writeTx.sign(keeperKey);
    let writeSignature: string;
    try {
      writeSignature = await connection.sendRawTransaction(await writeTx.serialize(), {
        skipPreflight: false,
        maxRetries: 3n,
      });
    } catch (error) {
      throw new Error(
        `The sigil was minted as ${mintKeypair.publicKey.toBase58()}, but its art stopped at ${offset} of ${art.length} bytes. The record is on-chain; the same keeper can finish the art.`,
        { cause: error },
      );
    }
    await waitForSignature(params.rpc, writeSignature);
  }
  return { mint: mintKeypair.publicKey.toBase58(), tx: signature };
}

export interface ReleaseParams {
  keeper: SolanaKeeper;
  sigil: string;
  program: string;
  rpc: string;
  cluster: string;
  seq: number;
  prev: string;
  head: string;
}

export async function releaseSigil(params: ReleaseParams): Promise<{ tx: string }> {
  if (params.cluster !== "devnet") throw new Error(DEVNET_ONLY);
  const sigilId = hexToBytes(params.sigil);
  const prev = hexToBytes(params.prev);
  const head = hexToBytes(params.head);

  const {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    TransactionInstruction,
    ComputeBudgetProgram,
    SystemProgram,
  } = await import("@solana/web3.js");

  const connection = new Connection(params.rpc, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS) {
    throw new Error("This RPC is not devnet, so nothing was released. Point VITE_SOLANA_RPC at devnet.");
  }

  const program = new PublicKey(params.program);
  const keeperKey = await Keypair.fromSecretKey(params.keeper.secretKey);
  const [sigilPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("sigil"), sigilId],
    program,
  );
  const [ledgerPda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("ledger")],
    program,
  );

  const revokeIx = new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: keeperKey.publicKey, isSigner: true, isWritable: true },
      { pubkey: sigilPda, isSigner: false, isWritable: true },
      { pubkey: ledgerPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeRevokeData(
      await instructionDiscriminator("revoke"),
      sigilId,
      params.seq,
      prev,
      head,
    ),
  });

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction();
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), revokeIx);
  transaction.feePayer = keeperKey.publicKey;
  transaction.recentBlockhash = blockhash;
  await transaction.sign(keeperKey);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(await transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3n,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/insufficient funds|no record of a prior credit/i.test(message)) {
      throw new Error("The keeper has no devnet SOL for the fee. Fund it, then release again.", {
        cause: error,
      });
    }
    throw new Error(
      `The cluster refused the release: ${message || "no reason was given"}. Nothing was released.`,
      { cause: error },
    );
  }
  await waitForSignature(params.rpc, signature);
  return { tx: signature };
}
