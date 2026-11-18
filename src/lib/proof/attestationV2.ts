import { AMBIENCES, type SolanaAttestationV2 } from "../types";
import {
  buildMessageV2,
  clampDuration,
  computeSealV2,
  outcomeOf,
  parseMessageV2,
  sealMatches,
  sigilIdFor,
  type SealableRecord,
} from "./canonical";
import { signMessage, verifyMessage, type SolanaKeeper } from "./keeper";

export interface SealVigilV2Input {
  vigil: SealableRecord & { id: string };
  keeper: SolanaKeeper;
  cluster: string;
  program: string | null;
  clockDriftMs: number | null;
}

export interface SealedVigilV2 {
  sigil: string;
  seal: string;
  attestation: SolanaAttestationV2;
}

export async function sealVigilV2(input: SealVigilV2Input): Promise<SealedVigilV2> {
  const { vigil, keeper, cluster, program, clockDriftMs } = input;
  const sigil = await sigilIdFor(vigil.id);
  const seal = await computeSealV2(vigil, sigil, clockDriftMs);
  const message = buildMessageV2({
    cluster,
    program,
    sigil,
    keeper: keeper.address,
    startedAt: String(vigil.startedAt),
    durationMin: clampDuration(vigil.plannedMin),
    focusedSec: vigil.focusedSec,
    outcome: outcomeOf(vigil.completed),
    clockDriftMs,
    seal,
  });
  const signature = signMessage(keeper, message);
  return {
    sigil,
    seal,
    attestation: {
      v: 2,
      app: "vesper",
      chain: "solana",
      cluster,
      program,
      message,
      seal,
      record: {
        endedAt: String(vigil.endedAt),
        intention: vigil.intention,
        ambience: vigil.ambience,
      },
      signature,
      keeper: keeper.address,
    },
  };
}

const HEX_64 = /^[0-9a-f]{64}$/;
const DIGITS = /^\d+$/;

function isAmbience(value: unknown): value is SealableRecord["ambience"] {
  return AMBIENCES.some((preset) => preset.id === value);
}

export async function verifyAttestationV2(attestation: SolanaAttestationV2): Promise<boolean> {
  try {
    if (attestation?.v !== 2 || attestation.app !== "vesper" || attestation.chain !== "solana") {
      return false;
    }
    if (!HEX_64.test(attestation.seal)) return false;
    const message = parseMessageV2(attestation.message);
    if (!message) return false;
    if (message.seal !== attestation.seal) return false;
    if (message.keeper !== attestation.keeper) return false;
    if (message.cluster !== attestation.cluster) return false;
    if ((message.program ?? null) !== (attestation.program ?? null)) return false;
    if (!verifyMessage(attestation.message, attestation.signature, attestation.keeper)) return false;

    const { record } = attestation;
    if (!DIGITS.test(record?.endedAt ?? "")) return false;
    if (typeof record.intention !== "string") return false;
    if (!isAmbience(record.ambience)) return false;

    const sealedRecord: SealableRecord = {
      startedAt: Number(message.startedAt),
      endedAt: Number(record.endedAt),
      plannedMin: message.durationMin,
      focusedSec: message.focusedSec,
      completed: message.outcome === "completed",
      intention: record.intention,
      ambience: record.ambience,
    };
    return sealMatches(sealedRecord, message.sigil, message.clockDriftMs, attestation.seal);
  } catch {
    return false;
  }
}

export function attestationV2Json(attestation: SolanaAttestationV2): string {
  return JSON.stringify(attestation, null, 2);
}
