import { keccak256, recoverTypedDataAddress, toBytes, type Hex, type TypedData } from "viem";
import type { StoredAttestation, Vigil } from "./types";

export const VIGIL_TYPES = {
  Vigil: [
    { name: "id", type: "bytes32" },
    { name: "keeper", type: "address" },
    { name: "startedAt", type: "string" },
    { name: "durationMin", type: "uint32" },
    { name: "seal", type: "bytes32" },
  ],
} as const;

export interface VigilMessage extends Record<string, unknown> {
  id: Hex;
  keeper: Hex;
  startedAt: string;
  durationMin: number;
  seal: Hex;
}

export interface VigilTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract?: Hex;
  };
  types: typeof VIGIL_TYPES;
  primaryType: "Vigil";
  message: VigilMessage;
}

export type SealableVigil = Pick<
  Vigil,
  "id" | "startedAt" | "endedAt" | "plannedMin" | "focusedSec" | "completed" | "intention" | "ambience"
>;

export function messageId(vigilId: string): Hex {
  return keccak256(toBytes(vigilId));
}

/** Hash of the vigil's full record. Recomputed on every read to catch edited archives. */
export function buildSeal(vigil: SealableVigil): Hex {
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

export function verifySeal(vigil: Vigil): boolean {
  return buildSeal(vigil) === vigil.seal;
}

export function buildTypedData(
  vigil: Vigil,
  keeper: Hex,
  chainId: number,
  verifyingContract?: Hex,
): VigilTypedData {
  return {
    domain: {
      name: "Vesper",
      version: "1",
      chainId,
      ...(verifyingContract ? { verifyingContract } : {}),
    },
    types: VIGIL_TYPES,
    primaryType: "Vigil",
    message: {
      id: messageId(vigil.id),
      keeper,
      startedAt: String(vigil.startedAt),
      durationMin: Math.min(600, Math.max(1, vigil.plannedMin)),
      seal: vigil.seal,
    },
  };
}

function asViemTypedData(data: VigilTypedData) {
  return {
    domain: data.domain,
    types: data.types as unknown as TypedData,
    primaryType: "Vigil" as const,
    message: data.message as unknown as Record<string, unknown>,
  };
}

export async function verifyAttestation(attestation: StoredAttestation): Promise<boolean> {
  try {
    if (attestation.message.keeper.toLowerCase() !== attestation.address.toLowerCase()) return false;
    if (attestation.message.durationMin < 1 || attestation.message.durationMin > 600) return false;
    if (!/^\d+$/.test(attestation.message.startedAt)) return false;
    const recovered = await recoverTypedDataAddress({
      ...asViemTypedData({
        domain: attestation.domain,
        types: VIGIL_TYPES,
        primaryType: "Vigil",
        message: {
          id: attestation.message.id,
          keeper: attestation.message.keeper,
          startedAt: attestation.message.startedAt,
          durationMin: attestation.message.durationMin,
          seal: attestation.message.seal,
        },
      }),
      signature: attestation.signature,
    });
    return recovered.toLowerCase() === attestation.address.toLowerCase();
  } catch {
    return false;
  }
}

export function attestationJson(attestation: StoredAttestation): string {
  return JSON.stringify(attestation, null, 2);
}

export function shortHash(hash: string, lead = 6, tail = 4): string {
  if (hash.length <= lead + tail + 2) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}
