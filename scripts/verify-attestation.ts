import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Connection } from "@solana/web3.js";
import bs58 from "bs58";
// tweetnacl ships as CommonJS; a namespace import loses `sign` under Node ESM.
import nacl from "tweetnacl";
import { keccak256, recoverTypedDataAddress, toBytes, type Hex, type TypedData } from "viem";
import { deriveSigilAddress, lookupSigil } from "./verify-solana";

const VIGIL_TYPES = {
  Vigil: [
    { name: "id", type: "bytes32" },
    { name: "keeper", type: "address" },
    { name: "startedAt", type: "string" },
    { name: "durationMin", type: "uint32" },
    { name: "seal", type: "bytes32" },
  ],
} as const;

interface Attestation {
  address: Hex;
  chainId?: number;
  signature: Hex;
  domain: { name: string; version: string; chainId: number; verifyingContract?: Hex };
  message: { id: Hex; keeper: Hex; startedAt: string; durationMin: number; seal: Hex };
}

interface VigilRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  plannedMin: number;
  focusedSec: number;
  completed: boolean;
  intention: string;
  ambience: string;
  seal: Hex;
  attestation?: Attestation;
}

interface V2Attestation {
  v: 2;
  app: string;
  chain: string;
  cluster: string;
  program: string | null;
  message: string;
  seal: string;
  record: { endedAt: string; intention: string; ambience: string };
  signature: string;
  keeper: string;
}

interface V2Vigil {
  sealV2?: string;
  solana?: { sigil?: string; attestation?: V2Attestation };
}

interface V2Message {
  cluster: string;
  program: string | null;
  sigil: string;
  keeper: string;
  startedAt: string;
  durationMin: number;
  focusedSec: number;
  outcome: string;
  clockDriftMs: number | null;
  seal: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,90}$/;
const CLOCK_BUDGET_MS = 2_000;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function isAttestation(value: unknown): value is Attestation {
  const candidate = value as Attestation;
  return Boolean(
    candidate &&
      typeof candidate.signature === "string" &&
      candidate.message &&
      typeof candidate.message.startedAt === "string" &&
      candidate.domain &&
      typeof candidate.domain.chainId === "number",
  );
}

function isV2Attestation(value: unknown): value is V2Attestation {
  const candidate = value as V2Attestation;
  return Boolean(
    candidate &&
      candidate.v === 2 &&
      candidate.chain === "solana" &&
      typeof candidate.message === "string" &&
      typeof candidate.signature === "string" &&
      candidate.record,
  );
}

function parseV2Message(text: string): V2Message | null {
  const lines = text.split("\n");
  if (lines.length !== 11 || lines[0] !== "vesper.vigil.v2") return null;
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
  const [cluster, program, sigil, keeper, startedAt, duration, focused, outcome, drift, seal] =
    values;
  const durationMin = Number(duration);
  const focusedSec = Number(focused);
  const clockDriftMs = drift === "unknown" ? null : Number(drift);
  if (!cluster) return null;
  if (program !== "unminted" && !BASE58.test(program)) return null;
  if (!SHA256_HEX.test(sigil) || !SHA256_HEX.test(seal)) return null;
  if (!BASE58.test(keeper)) return null;
  if (!/^\d+$/.test(startedAt)) return null;
  if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 600) return null;
  if (!Number.isInteger(focusedSec) || focusedSec < 0) return null;
  if (outcome !== "completed" && outcome !== "released") return null;
  if (clockDriftMs !== null && (!Number.isInteger(clockDriftMs) || clockDriftMs < 0)) return null;
  return {
    cluster,
    program: program === "unminted" ? null : program,
    sigil,
    keeper,
    startedAt,
    durationMin,
    focusedSec,
    outcome,
    clockDriftMs,
    seal,
  };
}

function sealV2Of(attestation: V2Attestation, message: V2Message): string {
  return createHash("sha256")
    .update(
      [
        "vesper.seal.v2",
        message.sigil,
        message.startedAt,
        attestation.record.endedAt,
        String(message.durationMin),
        String(message.focusedSec),
        message.outcome,
        attestation.record.intention,
        attestation.record.ambience,
        message.clockDriftMs === null ? "unknown" : String(message.clockDriftMs),
      ].join("|"),
      "utf8",
    )
    .digest("hex");
}

function sealOf(vigil: VigilRecord): Hex {
  return keccak256(
    toBytes(
      [
        "vesper.seal.v1",
        vigil.id,
        String(vigil.startedAt),
        String(vigil.endedAt),
        String(vigil.plannedMin),
        String(vigil.focusedSec),
        vigil.completed ? "completed" : "released",
        vigil.intention,
        vigil.ambience,
      ].join("|"),
    ),
  );
}

async function verify(attestation: Attestation): Promise<{ signer: Hex; valid: boolean }> {
  const { message, domain } = attestation;
  if (!ADDRESS.test(message.keeper) || !ADDRESS.test(attestation.address)) fail("keeper address is malformed");
  if (!HEX32.test(message.id) || !HEX32.test(message.seal)) fail("id or seal is not bytes32");
  if (!SIGNATURE.test(attestation.signature)) fail("signature is malformed");
  if (message.keeper.toLowerCase() !== attestation.address.toLowerCase()) fail("keeper does not match signer");
  if (!/^\d+$/.test(message.startedAt)) fail("startedAt must be a digit-only timestamp");
  if (message.durationMin < 1 || message.durationMin > 600) fail("durationMin is outside 1–600");

  const signer = await recoverTypedDataAddress({
    domain,
    types: VIGIL_TYPES as unknown as TypedData,
    primaryType: "Vigil",
    message: {
      id: message.id,
      keeper: message.keeper,
      startedAt: message.startedAt,
      durationMin: message.durationMin,
      seal: message.seal,
    },
    signature: attestation.signature,
  });

  return { signer, valid: signer.toLowerCase() === attestation.address.toLowerCase() };
}

function verifyV2(attestation: V2Attestation): {
  valid: boolean;
  sealMatches: boolean;
  signatureValid: boolean;
  message: V2Message | null;
} {
  if (attestation.app !== "vesper" || attestation.chain !== "solana") {
    fail("v2 attestation is not a Vesper Solana record");
  }
  if (!SHA256_HEX.test(attestation.seal)) fail("v2 seal is not 32 bytes of lowercase hex");
  if (typeof attestation.keeper !== "string" || !BASE58.test(attestation.keeper)) {
    fail("v2 keeper is malformed");
  }
  if (typeof attestation.signature !== "string" || !BASE58.test(attestation.signature)) {
    fail("v2 signature is malformed");
  }
  if (!/^\d+$/.test(attestation.record?.endedAt ?? "")) fail("v2 endedAt must be a digit-only timestamp");
  if (typeof attestation.record.intention !== "string") fail("v2 record has no intention");
  if (typeof attestation.record.ambience !== "string") fail("v2 record has no ambience");

  const message = parseV2Message(attestation.message);
  if (!message) fail("v2 message is not the canonical vesper.vigil.v2 layout");

  let consistent = true;
  if (message.seal !== attestation.seal) {
    console.log("  message     ✗ seal in the message differs from the attestation");
    consistent = false;
  }
  if (message.keeper !== attestation.keeper) {
    console.log("  message     ✗ keeper in the message differs from the attestation");
    consistent = false;
  }
  if (message.cluster !== attestation.cluster) {
    console.log("  message     ✗ cluster in the message differs from the attestation");
    consistent = false;
  }
  if ((message.program ?? null) !== (attestation.program ?? null)) {
    console.log("  message     ✗ program in the message differs from the attestation");
    consistent = false;
  }

  const sealMatches = sealV2Of(attestation, message) === attestation.seal;
  const signatureValid = verifyEd25519(attestation.message, attestation.signature, attestation.keeper);

  return { valid: consistent && signatureValid && sealMatches, sealMatches, signatureValid, message };
}

function verifyEd25519(message: string, signature: string, keeper: string): boolean {
  try {
    const signatureBytes = bs58.decode(signature);
    const publicKey = bs58.decode(keeper);
    return (
      signatureBytes.length === nacl.sign.signatureLength &&
      publicKey.length === nacl.sign.publicKeyLength &&
      nacl.sign.detached.verify(new TextEncoder().encode(message), signatureBytes, publicKey)
    );
  } catch {
    return false;
  }
}

async function reportRegistry(
  message: V2Message,
  keeper: string,
  rpc: string,
): Promise<boolean> {
  if (!message.program) return true;
  const { address } = await deriveSigilAddress(message.program, message.sigil);
  let state: Awaited<ReturnType<typeof lookupSigil>>;
  try {
    const connection = new Connection(rpc, "confirmed");
    state = await Promise.race([
      lookupSigil(connection, address),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timed out")), 10_000),
      ),
    ]);
  } catch (error) {
    console.log(`  registry    ✗ could not reach ${rpc} (${error instanceof Error ? error.message : "unknown error"})`);
    return false;
  }
  if (state === "missing") {
    console.log("  registry    · not minted on this cluster");
    return true;
  }
  if (state === null) {
    console.log("  registry    ✗ the account exists but does not read as a Vesper sigil");
    return false;
  }
  const keeperMatches = state.keeper === keeper;
  console.log(
    `  registry    ${keeperMatches ? "✓ minted, keeper matches" : "✗ minted, keeper differs from the attestation"}`,
  );
  console.log(`  revoked     ${state.revoked ? "yes — the keeper revoked this sigil" : "no"}`);
  return keeperMatches;
}

const args = process.argv.slice(2);
const rpcIndex = args.indexOf("--rpc");
const rpc = rpcIndex >= 0 ? args[rpcIndex + 1] : undefined;
const file = args.find(
  (arg, index) => !arg.startsWith("--") && (rpcIndex < 0 || index !== rpcIndex + 1),
);

if (!file || file === "--help" || file === "-h") {
  console.log("Usage: npm run verify:attestation -- <attestation.json | archive.json> [--rpc <url>]");
  console.log("Recovers EIP-712 signers (v1) and checks Ed25519 signatures and seals (v2)");
  console.log("without trusting the Vesper app. --rpc also reads the sigil from a Solana cluster.");
  process.exit(file ? 0 : 1);
}
if (rpcIndex >= 0 && !rpc) fail("--rpc needs a URL");

const raw = JSON.parse(await readFile(file, "utf8"));
type Row =
  | { version: 1; attestation: Attestation; vigil?: VigilRecord }
  | { version: 2; attestation: V2Attestation; vigil?: V2Vigil };
const rows: Row[] = [];

if (Array.isArray(raw?.vigils)) {
  for (const vigil of raw.vigils as Array<VigilRecord & V2Vigil>) {
    if (isAttestation(vigil?.attestation)) {
      rows.push({ version: 1, attestation: vigil.attestation, vigil });
    }
    if (isV2Attestation(vigil?.solana?.attestation)) {
      rows.push({ version: 2, attestation: vigil.solana.attestation, vigil });
    }
  }
} else if (isV2Attestation(raw)) {
  rows.push({ version: 2, attestation: raw });
} else if (isAttestation(raw)) {
  rows.push({ version: 1, attestation: raw });
} else {
  fail("not an attestation or a Vesper archive");
}

if (rows.length === 0) {
  console.log("No sealed vigils in this file. Every sigil is still valid without a wallet.");
  process.exit(0);
}

let failures = 0;
for (const row of rows) {
  if (row.version === 1) {
    const { attestation, vigil } = row;
    const { signer, valid } = await verify(attestation);
    const sealMatches = vigil ? sealOf(vigil) === vigil.seal : null;
    if (!valid || sealMatches === false) failures += 1;

    console.log(`\nVigil ${attestation.message.id.slice(0, 12)}…`);
    console.log(`  keeper      ${attestation.address}`);
    console.log(`  chain       ${attestation.domain.chainId}${attestation.chainId && attestation.chainId !== attestation.domain.chainId ? ` (stored as ${attestation.chainId})` : ""}`);
    console.log(`  signature   ${valid ? "✓ recovers to the keeper" : `✗ recovers to ${signer}`}`);
    if (vigil) console.log(`  seal        ${sealMatches ? "✓ matches the record" : "✗ record was altered"}`);
    console.log(`  duration    ${attestation.message.durationMin} min`);
    console.log(`  startedAt   ${attestation.message.startedAt}`);
    continue;
  }

  const { attestation, vigil } = row;
  const result = verifyV2(attestation);
  let ok = result.valid;
  if (vigil?.sealV2 && vigil.sealV2 !== attestation.seal) {
    console.log("  stored      ✗ the archived sealV2 differs from the attestation");
    ok = false;
  }
  if (!ok) failures += 1;

  console.log(`\nVigil ${result.message?.sigil.slice(0, 12) ?? ""}…`);
  console.log(`  keeper      ${attestation.keeper}`);
  console.log(`  chain       solana ${attestation.cluster}`);
  console.log(`  program     ${attestation.program ?? "unminted"}`);
  console.log(
    `  signature   ${result.signatureValid ? "✓ Ed25519 signature matches the keeper" : "✗ signature does not match the keeper"}`,
  );
  console.log(`  seal        ${result.sealMatches ? "✓ matches the record" : "✗ record was altered"}`);
  if (result.message) {
    console.log(`  duration    ${result.message.durationMin} min`);
    console.log(`  startedAt   ${result.message.startedAt}`);
    console.log(`  clock       ${clockLabel(result.message.clockDriftMs)}`);
  }
  if (rpc && result.message) {
    const registryOk = await reportRegistry(result.message, attestation.keeper, rpc);
    if (!registryOk) failures += 1;
  }
}

function clockLabel(driftMs: number | null): string {
  if (driftMs === null) return "not sampled";
  if (driftMs <= CLOCK_BUDGET_MS) return `${driftMs} ms drift, clock steady`;
  const seconds = Math.round(driftMs / 1_000);
  return `${driftMs} ms drift, clock moved by ${seconds} seconds (evidence only)`;
}

if (failures > 0) {
  console.error(`\n✗ ${failures} of ${rows.length} attestations failed verification.`);
  process.exit(1);
}

console.log(`\n✓ ${rows.length} of ${rows.length} attestations verified. No Vesper code was trusted.`);
console.log("  This proves: every keeper signed its record and every seal still matches.");
console.log(
  "  This does not prove: that the clock was right, that the time was spent as described, or that the keeper is someone you trust.",
);
