import type { Hex } from "viem";
import type { SolanaAttestationV2, StoredAttestation, Vigil } from "../src/lib/types";

export const ADDRESS = "0x1111111111111111111111111111111111111111" as Hex;
export const SEAL = `0x${"ab".repeat(32)}` as Hex;
export const SIGNATURE = `0x${"11".repeat(65)}` as Hex;

export function makeVigil(overrides: Partial<Vigil> = {}): Vigil {
  const startedAt = overrides.startedAt ?? new Date(2026, 0, 10, 9, 0, 0).getTime();
  return {
    id: "vigil-1",
    startedAt,
    endedAt: startedAt + 25 * 60_000,
    plannedMin: 25,
    focusedSec: 25 * 60,
    completed: true,
    intention: "Finish the chapter",
    ambience: "hollow",
    levels: { wind: 0.55, rain: 0.1, fire: 0.16, drone: 0.42, bells: 0.14 },
    seal: SEAL,
    transmission: "The candle leaned toward your words.",
    ...overrides,
  };
}

export function makeAttestation(overrides: Partial<StoredAttestation> = {}): StoredAttestation {
  return {
    address: ADDRESS,
    chainId: 8453,
    kind: "local",
    signature: SIGNATURE,
    signedAt: 1_767_000_000_000,
    domain: { name: "Vesper", version: "1", chainId: 8453 },
    message: {
      id: `0x${"cd".repeat(32)}` as Hex,
      keeper: ADDRESS,
      startedAt: String(new Date(2026, 0, 10, 9, 0, 0).getTime()),
      durationMin: 25,
      seal: SEAL,
    },
    ...overrides,
  };
}

export function makeSolanaAttestation(
  overrides: Partial<SolanaAttestationV2> = {},
): SolanaAttestationV2 {
  return {
    v: 2,
    app: "vesper",
    chain: "solana",
    cluster: "devnet",
    program: null,
    message: "vesper.vigil.v2\ntest fixture, never verified",
    seal: "cd".repeat(32),
    record: { endedAt: "1767000000000", intention: "Finish the chapter", ambience: "hollow" },
    signature: "2".repeat(64),
    keeper: "11111111111111111111111111111111",
    ...overrides,
  };
}
