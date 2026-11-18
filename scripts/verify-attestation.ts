import { readFile } from "node:fs/promises";
import { keccak256, recoverTypedDataAddress, toBytes, type Hex, type TypedData } from "viem";

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

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

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

const file = process.argv[2];
if (!file || file === "--help" || file === "-h") {
  console.log("Usage: npm run verify:attestation -- <attestation.json | archive.json>");
  console.log("Recovers the EIP-712 signer and recomputes seals without trusting the Vesper app.");
  process.exit(file ? 0 : 1);
}

const raw = JSON.parse(await readFile(file, "utf8"));
const rows: Array<{ attestation: Attestation; vigil?: VigilRecord }> = [];

if (Array.isArray(raw?.vigils)) {
  for (const vigil of raw.vigils as VigilRecord[]) {
    if (vigil?.attestation) rows.push({ attestation: vigil.attestation, vigil });
  }
} else if (isAttestation(raw)) {
  rows.push({ attestation: raw });
} else {
  fail("not an attestation or a Vesper archive");
}

if (rows.length === 0) {
  console.log("No sealed vigils in this file. Every sigil is still valid without a wallet.");
  process.exit(0);
}

let failures = 0;
for (const { attestation, vigil } of rows) {
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
}

if (failures > 0) {
  console.error(`\n✗ ${failures} of ${rows.length} attestations failed verification.`);
  process.exit(1);
}

console.log(`\n✓ ${rows.length} of ${rows.length} attestations verified. No Vesper code was trusted.`);
