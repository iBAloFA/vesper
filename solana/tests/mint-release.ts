/**
 * Program integration suite: drives the built `vesper_sigil.so` on a local
 * validator with the same encoders the app uses. The validator must serve the
 * program at PROGRAM_ID; `solana/scripts/test.sh` starts one.
 *
 * Run: npx tsx solana/tests/mint-release.ts
 */
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { sealVigilV2 } from "../../src/lib/proof/attestationV2";
import { createKeeper, type SolanaKeeper } from "../../src/lib/proof/keeper";
import {
  ART_CHUNK_BYTES,
  artForSigil,
  encodeMintData,
  encodeRevokeData,
  encodeWriteArtData,
  instructionDiscriminator,
  messageField,
  planMint,
  type MintPlan,
} from "../../src/lib/proof/solanaMint";
import type { SolanaAttestationV2 } from "../../src/lib/types";

const RPC = process.env.SOLANA_RPC ?? "http://127.0.0.1:8899";
const PROGRAM = new PublicKey("94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const INSTRUCTIONS = new PublicKey("Sysvar1nstructions1111111111111111111111111");

const CONNECTION = new Connection(RPC, "confirmed");
const SIGIL_SEED = new TextEncoder().encode("sigil");
const ART_SEED = new TextEncoder().encode("art");

let passed = 0;

function ok(name: string): void {
  passed += 1;
  console.log(`ok ${passed} — ${name}`);
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const payload = (await response.json()) as { error?: { message?: string }; result?: T };
  if (payload.error) throw new Error(`${method}: ${payload.error.message}`);
  return payload.result as T;
}

async function confirm(signature: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const status = await rpc<{ value: Array<{ confirmationStatus?: string; err: unknown } | null> }>(
      "getSignatureStatuses",
      [[signature], { searchTransactionHistory: true }],
    );
    const entry = status.value[0];
    if (entry) {
      if (entry.err) throw new Error(`${signature} failed: ${JSON.stringify(entry.err)}`);
      if (entry.confirmationStatus === "confirmed" || entry.confirmationStatus === "finalized") return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${signature} was not confirmed in time.`);
}

async function fund(address: PublicKey): Promise<void> {
  await CONNECTION.requestAirdrop(address, 10_000_000_000);
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const balance = await CONNECTION.getBalance(address);
    if (balance >= 10_000_000_000) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${address.toBase58()} was not funded.`);
}

async function send(
  instructions: TransactionInstruction[],
  signers: Keypair[],
  feePayer: Keypair,
): Promise<string> {
  const { blockhash } = await CONNECTION.getLatestBlockhash("confirmed");
  const transaction = new Transaction();
  for (const instruction of instructions) transaction.add(instruction);
  transaction.feePayer = feePayer.publicKey;
  transaction.recentBlockhash = blockhash;
  await transaction.sign(...signers);
  const signature = await CONNECTION.sendRawTransaction(await transaction.serialize(), {
    skipPreflight: false,
  });
  await confirm(signature);
  return signature;
}

interface Expectation {
  code?: string;
  text?: RegExp;
}

async function expectFailure(
  instructions: TransactionInstruction[],
  signers: Keypair[],
  feePayer: Keypair,
  name: string,
  expectation: Expectation,
): Promise<void> {
  const { blockhash } = await CONNECTION.getLatestBlockhash("confirmed");
  const transaction = new Transaction();
  for (const instruction of instructions) transaction.add(instruction);
  transaction.feePayer = feePayer.publicKey;
  transaction.recentBlockhash = blockhash;
  await transaction.sign(...signers);
  const simulation = await CONNECTION.simulateTransaction(transaction);
  const logs = (simulation.value.logs ?? []).join("\n");
  if (!simulation.value.err) throw new Error(`${name}: the program accepted it.`);
  const code = logs.match(/Error Code: (\w+)/)?.[1];
  if (expectation.code && code !== expectation.code) {
    throw new Error(`${name}: expected ${expectation.code}, saw ${code ?? "no Anchor code"}.\n${logs}`);
  }
  if (expectation.text && !expectation.text.test(logs)) {
    throw new Error(`${name}: the logs do not mention ${expectation.text}.\n${logs}`);
  }
  ok(name);
}

function keeperPair(keeper: SolanaKeeper): Promise<Keypair> {
  return Keypair.fromSecretKey(keeper.secretKey);
}

async function sealedVigil(keeper: SolanaKeeper, id: string): Promise<SolanaAttestationV2> {
  const { attestation } = await sealVigilV2({
    vigil: {
      id,
      startedAt: 1768035600000,
      endedAt: 1768037100000,
      plannedMin: 25,
      focusedSec: 1500,
      completed: true,
      intention: "Finish the chapter",
      ambience: "hollow",
    },
    keeper,
    cluster: "devnet",
    program: PROGRAM.toBase58(),
    clockDriftMs: null,
  });
  return attestation;
}

async function planFor(keeper: SolanaKeeper, id: string): Promise<{ attestation: SolanaAttestationV2; plan: MintPlan }> {
  const attestation = await sealedVigil(keeper, id);
  const plan = await planMint(attestation, artForSigil(messageField(attestation.message, "sigil")));
  return { attestation, plan };
}

function verifyInstruction(keeper: SolanaKeeper, message: string, signature: string): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: keeper.publicKey,
    message: new TextEncoder().encode(message),
    signature: bs58.decode(signature),
  });
}

async function sigilPda(sigilId: Uint8Array): Promise<PublicKey> {
  return (await PublicKey.findProgramAddress([SIGIL_SEED, sigilId], PROGRAM))[0];
}

async function artPda(sigilId: Uint8Array): Promise<PublicKey> {
  return (await PublicKey.findProgramAddress([ART_SEED, sigilId], PROGRAM))[0];
}

async function ledgerPda(): Promise<PublicKey> {
  return (await PublicKey.findProgramAddress([new TextEncoder().encode("ledger")], PROGRAM))[0];
}

async function tokenAccountOf(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
  return (
    await PublicKey.findProgramAddress([owner.toBytes(), TOKEN_2022.toBytes(), mint.toBytes()], ATA_PROGRAM)
  )[0];
}

async function mintInstruction(
  plan: MintPlan,
  keeperKey: PublicKey,
  mint: PublicKey,
  tokenAccount: PublicKey,
): Promise<TransactionInstruction> {
  return new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: keeperKey, isSigner: true, isWritable: true },
      { pubkey: await sigilPda(plan.sigilId), isSigner: false, isWritable: true },
      { pubkey: await artPda(plan.sigilId), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: true, isWritable: true },
      { pubkey: tokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
      { pubkey: ATA_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: RENT, isSigner: false, isWritable: false },
      { pubkey: INSTRUCTIONS, isSigner: false, isWritable: false },
    ],
    data: encodeMintData(await instructionDiscriminator("mint"), plan),
  });
}

async function mintInstructions(
  keeper: SolanaKeeper,
  plan: MintPlan,
  options: { message?: string; signature?: string; signer?: SolanaKeeper; mint?: Keypair } = {},
): Promise<{ instructions: TransactionInstruction[]; mint: Keypair; tokenAccount: PublicKey }> {
  const keeperKey = await keeperPair(keeper);
  const mint = options.mint ?? (await Keypair.generate());
  const tokenAccount = await tokenAccountOf(keeperKey.publicKey, mint.publicKey);
  const instructions: TransactionInstruction[] = [];
  if (options.message !== undefined) {
    instructions.push(
      verifyInstruction(options.signer ?? keeper, options.message, options.signature ?? ""),
    );
  }
  instructions.push(await mintInstruction(plan, keeperKey.publicKey, mint.publicKey, tokenAccount));
  return { instructions, mint, tokenAccount };
}

async function mintAndWrite(keeper: SolanaKeeper, plan: MintPlan, message: string, signature: string) {
  const keeperKey = await keeperPair(keeper);
  const built = await mintInstructions(keeper, plan, { message, signature });
  const tx = await send(built.instructions, [keeperKey, built.mint], keeperKey);
  for (const instructions of await artBatches(keeper, plan)) {
    await send(instructions, [keeperKey], keeperKey);
  }
  return { ...built, tx };
}

async function artBatches(keeper: SolanaKeeper, plan: MintPlan): Promise<TransactionInstruction[][]> {
  const keeperKey = await keeperPair(keeper);
  const art = new TextEncoder().encode(plan.art);
  const discriminator = await instructionDiscriminator("write_art");
  const batches: TransactionInstruction[][] = [];
  for (let offset = 0; offset < art.length; offset += ART_CHUNK_BYTES) {
    const sigil = await sigilPda(plan.sigilId);
    const artAccount = await artPda(plan.sigilId);
    batches.push([
      new TransactionInstruction({
        programId: PROGRAM,
        keys: [
          { pubkey: keeperKey.publicKey, isSigner: true, isWritable: true },
          { pubkey: sigil, isSigner: false, isWritable: false },
          { pubkey: artAccount, isSigner: false, isWritable: true },
        ],
        data: encodeWriteArtData(
          discriminator,
          plan.sigilId,
          offset,
          art.slice(offset, offset + ART_CHUNK_BYTES),
        ),
      }),
    ]);
  }
  return batches;
}

async function revokeInstruction(
  keeperKey: PublicKey,
  sigilId: Uint8Array,
  seq: number,
  prev: Uint8Array,
  head: Uint8Array,
): Promise<TransactionInstruction> {
  return new TransactionInstruction({
    programId: PROGRAM,
    keys: [
      { pubkey: keeperKey, isSigner: true, isWritable: true },
      { pubkey: await sigilPda(sigilId), isSigner: false, isWritable: true },
      { pubkey: await ledgerPda(), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeRevokeData(await instructionDiscriminator("revoke"), sigilId, seq, prev, head),
  });
}

function bytes32(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

async function sigilState(sigilId: Uint8Array): Promise<{ length: number; keeper: string; revoked: boolean } | null> {
  const account = await CONNECTION.getAccountInfo(await sigilPda(sigilId));
  if (!account) return null;
  return {
    length: account.data.length,
    keeper: bs58.encode(account.data.subarray(40, 72)),
    revoked: account.data[187] !== 0,
  };
}

async function ledgerState(): Promise<{ seq: bigint; head: Uint8Array } | null> {
  const account = await CONNECTION.getAccountInfo(await ledgerPda());
  if (!account) return null;
  const view = new DataView(account.data.buffer, account.data.byteOffset, account.data.byteLength);
  return { seq: view.getBigUint64(8, true), head: account.data.subarray(16, 48) };
}

async function main(): Promise<void> {
  console.log(`validator ${RPC} at genesis ${await CONNECTION.getGenesisHash()}`);

  const keeper = createKeeper();
  const keeperKey = await keeperPair(keeper);
  await fund(keeperKey.publicKey);
  ok("the keeper holds devnet-scale lamports");

  // A full mint, then the art in chunks.
  const { attestation, plan } = await planFor(keeper, "vigil-a");
  const minted = await mintAndWrite(keeper, plan, attestation.message, attestation.signature);

  const state = await sigilState(plan.sigilId);
  if (!state || state.length !== 221) throw new Error(`the Sigil account is ${state?.length} bytes, not 221`);
  if (state.keeper !== keeper.address) throw new Error("the Sigil account names another keeper");
  ok("mint writes a 221-byte Sigil PDA naming the keeper");

  const balance = await CONNECTION.getTokenAccountBalance(minted.tokenAccount);
  if (balance.value.amount !== "1" || balance.value.decimals !== 0) {
    throw new Error(`the token account holds ${balance.value.amount} at ${balance.value.decimals} decimals`);
  }
  const mintInfo = await CONNECTION.getParsedAccountInfo(minted.mint.publicKey);
  const parsed = JSON.stringify(mintInfo.value?.data, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  if (!/nonTransferable/.test(parsed)) throw new Error("the mint has no NonTransferable extension");
  if (!/"mintAuthority":null/.test(parsed)) throw new Error("the mint authority was not revoked");
  ok("mint creates one zero-decimal soulbound token with no mint authority");

  const artBytes = new TextEncoder().encode(plan.art);
  const artAccount = await CONNECTION.getAccountInfo(await artPda(plan.sigilId));
  if (!artAccount || artAccount.data.length !== 12 + artBytes.length) {
    throw new Error(`the Art account is ${artAccount?.data.length ?? 0} bytes, not ${12 + artBytes.length}`);
  }
  if (Buffer.from(artAccount.data.subarray(12)).compare(Buffer.from(artBytes)) !== 0) {
    throw new Error("the stored art differs from the SVG");
  }
  ok(`write_art stores the ${artBytes.length}-byte SVG in ${Math.ceil(artBytes.length / ART_CHUNK_BYTES)} chunks`);

  // Mint-once.
  {
    const again = await mintInstructions(keeper, plan, {
      message: attestation.message,
      signature: attestation.signature,
    });
    await expectFailure(again.instructions, [keeperKey, again.mint], keeperKey, "a second mint for the same sigil is refused", {
      text: /already in use/,
    });
  }

  // Bounds.
  {
    const bad = await planFor(keeper, "vigil-bounds");
    const built = await mintInstructions(keeper, { ...bad.plan, durationMin: 0 }, {
      message: bad.attestation.message,
      signature: bad.attestation.signature,
    });
    await expectFailure(built.instructions, [keeperKey, built.mint], keeperKey, "a zero-minute vigil is refused", {
      code: "DurationBounds",
    });
  }

  // Signature paths.
  {
    const missing = await planFor(keeper, "vigil-nosig");
    const built = await mintInstructions(keeper, missing.plan);
    await expectFailure(built.instructions, [keeperKey, built.mint], keeperKey, "a mint with no Ed25519 instruction is refused", {
      code: "SignatureMissing",
    });
  }
  {
    const stranger = createKeeper();
    const foreign = await planFor(stranger, "vigil-other-keeper");
    const built = await mintInstructions(keeper, foreign.plan, {
      message: foreign.attestation.message,
      signature: foreign.attestation.signature,
      signer: stranger,
    });
    await expectFailure(built.instructions, [keeperKey, built.mint], keeperKey, "a signature by another keeper is refused", {
      code: "SignatureKeeper",
    });
  }
  {
    const swapped = await planFor(keeper, "vigil-other-message");
    const message = swapped.attestation.message.replace("outcome=completed", "outcome=released");
    const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), keeper.secretKey));
    const built = await mintInstructions(keeper, swapped.plan, { message, signature });
    await expectFailure(built.instructions, [keeperKey, built.mint], keeperKey, "a signature over another message is refused", {
      code: "SignatureMessage",
    });
  }

  // The art hash is checked on the final chunk, and a refused chunk rolls back.
  {
    const tampered = await planFor(keeper, "vigil-art-hash");
    tampered.plan.artHash[0] ^= 1;
    const built = await mintInstructions(keeper, tampered.plan, {
      message: tampered.attestation.message,
      signature: tampered.attestation.signature,
    });
    await send(built.instructions, [keeperKey, built.mint], keeperKey);
    const batches = await artBatches(keeper, tampered.plan);
    const accepted = batches.slice(0, -1);
    for (const instructions of accepted) await send(instructions, [keeperKey], keeperKey);
    await expectFailure(batches[batches.length - 1], [keeperKey], keeperKey, "art that does not match its hash is refused", {
      code: "BadArt",
    });
    const after = await CONNECTION.getAccountInfo(await artPda(tampered.plan.sigilId));
    const written = after
      ? new DataView(after.data.buffer, after.data.byteOffset, after.data.byteLength).getUint32(8, true)
      : 0;
    const expected = accepted.length * ART_CHUNK_BYTES;
    const artOfTampered = new TextEncoder().encode(tampered.plan.art);
    if (written !== expected || !after) {
      throw new Error(`the refused chunk was not rolled back (${written} of ${expected} bytes)`);
    }
    if (Buffer.from(after.data.subarray(12, 12 + written)).compare(Buffer.from(artOfTampered.subarray(0, written))) !== 0) {
      throw new Error("the surviving art does not match the chunks that were accepted");
    }
    ok("a refused final chunk leaves the earlier art intact");
  }
  {
    const skipped = await planFor(keeper, "vigil-art-order");
    const built = await mintInstructions(keeper, skipped.plan, {
      message: skipped.attestation.message,
      signature: skipped.attestation.signature,
    });
    await send(built.instructions, [keeperKey, built.mint], keeperKey);
    const chunk = new TextEncoder().encode(skipped.plan.art).slice(ART_CHUNK_BYTES, ART_CHUNK_BYTES * 2);
    const instruction = new TransactionInstruction({
      programId: PROGRAM,
      keys: [
        { pubkey: keeperKey.publicKey, isSigner: true, isWritable: true },
        { pubkey: await sigilPda(skipped.plan.sigilId), isSigner: false, isWritable: false },
        { pubkey: await artPda(skipped.plan.sigilId), isSigner: false, isWritable: true },
      ],
      data: encodeWriteArtData(await instructionDiscriminator("write_art"), skipped.plan.sigilId, ART_CHUNK_BYTES, chunk),
    });
    await expectFailure([instruction], [keeperKey], keeperKey, "an art chunk that skips ahead is refused", {
      code: "ArtChunk",
    });
  }

  // Soulbound: the token cannot leave the keeper.
  {
    const other = await Keypair.generate();
    const destination = await tokenAccountOf(other.publicKey, minted.mint.publicKey);
    const createAta = new TransactionInstruction({
      programId: ATA_PROGRAM,
      keys: [
        { pubkey: keeperKey.publicKey, isSigner: true, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: other.publicKey, isSigner: false, isWritable: false },
        { pubkey: minted.mint.publicKey, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_2022, isSigner: false, isWritable: false },
      ],
      data: new Uint8Array([0]),
    });
    await send([createAta], [keeperKey], keeperKey);
    const transfer = new TransactionInstruction({
      programId: TOKEN_2022,
      keys: [
        { pubkey: minted.tokenAccount, isSigner: false, isWritable: true },
        { pubkey: minted.mint.publicKey, isSigner: false, isWritable: false },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: keeperKey.publicKey, isSigner: true, isWritable: false },
      ],
      data: new Uint8Array([12, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
    });
    await expectFailure([transfer], [keeperKey], keeperKey, "the sigil token cannot be transferred", {
      text: /transfer is disabled/i,
    });
  }

  // The Requiem Ledger.
  {
    const head = bytes32(0xa1);
    await expectFailure(
      [await revokeInstruction(keeperKey.publicKey, plan.sigilId, 2, bytes32(0), head)],
      [keeperKey],
      keeperKey,
      "a release that skips a sequence is refused",
      { code: "LedgerSequence" },
    );
    await send([await revokeInstruction(keeperKey.publicKey, plan.sigilId, 1, bytes32(0), head)], [keeperKey], keeperKey);
    const released = await sigilState(plan.sigilId);
    if (!released?.revoked) throw new Error("the sigil was not marked released");
    const ledger = await ledgerState();
    if (ledger?.seq !== 1n || Buffer.compare(Buffer.from(ledger.head), Buffer.from(head)) !== 0) {
      throw new Error("the Ledger PDA did not record seq 1 and its head");
    }
    ok("the first release sets the flag and advances the Ledger PDA to seq 1");
    await expectFailure(
      [await revokeInstruction(keeperKey.publicKey, plan.sigilId, 2, head, bytes32(0xa2))],
      [keeperKey],
      keeperKey,
      "a second release of the same sigil is refused",
      { code: "AlreadyReleased" },
    );
  }
  {
    const next = await planFor(keeper, "vigil-b");
    await mintAndWrite(keeper, next.plan, next.attestation.message, next.attestation.signature);
    const head = bytes32(0xa3);
    await expectFailure(
      [await revokeInstruction(keeperKey.publicKey, next.plan.sigilId, 2, bytes32(0), head)],
      [keeperKey],
      keeperKey,
      "a release that names the wrong previous head is refused",
      { code: "LedgerSequence" },
    );
    await send([await revokeInstruction(keeperKey.publicKey, next.plan.sigilId, 2, bytes32(0xa1), head)], [keeperKey], keeperKey);
    const ledger = await ledgerState();
    if (ledger?.seq !== 2n) throw new Error(`the Ledger PDA is at seq ${ledger?.seq}, not 2`);
    ok("a chained release advances the Ledger PDA to seq 2");
  }
  {
    const third = await planFor(keeper, "vigil-c");
    await mintAndWrite(keeper, third.plan, third.attestation.message, third.attestation.signature);
    const stranger = await Keypair.generate();
    await fund(stranger.publicKey);
    await expectFailure(
      [await revokeInstruction(stranger.publicKey, third.plan.sigilId, 3, bytes32(0xa3), bytes32(0xa4))],
      [stranger],
      stranger,
      "a stranger cannot release a sigil",
      { code: "WrongKeeper" },
    );
  }

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error(`\nFAILED after ${passed} checks`);
  console.error(error);
  process.exitCode = 1;
});
