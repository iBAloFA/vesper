import { describe, expect, it } from "vitest";
import {
  attestationV2Json,
  sealVigilV2,
  verifyAttestationV2,
} from "../src/lib/proof/attestationV2";
import { computeSealV2, sigilIdFor } from "../src/lib/proof/canonical";
import { createKeeper } from "../src/lib/proof/keeper";
import type { SolanaAttestationV2 } from "../src/lib/types";

const VIGIL = {
  id: "vigil-v2-1",
  startedAt: 1768035600000,
  endedAt: 1768037100000,
  plannedMin: 25,
  focusedSec: 1500,
  completed: true,
  intention: "Finish the chapter",
  ambience: "hollow" as const,
};

async function sealed(cluster = "devnet", program: string | null = null) {
  const keeper = createKeeper();
  const result = await sealVigilV2({
    vigil: VIGIL,
    keeper,
    cluster,
    program,
    clockDriftMs: 120,
  });
  return { keeper, ...result };
}

describe("attestation v2", () => {
  it("assembles the message, seal, and record from the vigil alone", async () => {
    const { attestation, seal, sigil } = await sealed();
    expect(sigil).toBe(await sigilIdFor(VIGIL.id));
    expect(seal).toBe(await computeSealV2(VIGIL, sigil, 120));
    expect(attestation.v).toBe(2);
    expect(attestation.chain).toBe("solana");
    expect(attestation.message.split("\n")[0]).toBe("vesper.vigil.v2");
    expect(attestation.message).toContain(`seal=${seal}`);
    expect(attestation.message).toContain("clockDriftMs=120");
    expect(attestation.record).toEqual({
      endedAt: String(VIGIL.endedAt),
      intention: VIGIL.intention,
      ambience: VIGIL.ambience,
    });
    expect(JSON.parse(attestationV2Json(attestation))).toEqual(attestation);
  });

  it("verifies the signature and the seal", async () => {
    const { attestation } = await sealed();
    expect(await verifyAttestationV2(attestation)).toBe(true);
    const withProgram = await sealed("devnet", "11111111111111111111111111111111");
    expect(await verifyAttestationV2(withProgram.attestation)).toBe(true);
  });

  it("rejects an edited record, seal, keeper, signature, and version", async () => {
    const { attestation } = await sealed();
    const cases: SolanaAttestationV2[] = [
      { ...attestation, record: { ...attestation.record, intention: "Edited later" } },
      { ...attestation, record: { ...attestation.record, endedAt: "1768037100001" } },
      { ...attestation, seal: "ef".repeat(32) },
      { ...attestation, keeper: createKeeper().address },
      { ...attestation, signature: `${attestation.signature.slice(0, -2)}zz` },
      { ...attestation, cluster: "mainnet-beta" },
      { ...attestation, v: 1 as unknown as 2 },
    ];
    for (const candidate of cases) {
      expect(await verifyAttestationV2(candidate)).toBe(false);
    }
  });

  it("rejects a message that was swapped for a different one", async () => {
    const first = await sealed();
    const second = await sealed();
    const swapped: SolanaAttestationV2 = { ...first.attestation, message: second.attestation.message };
    expect(await verifyAttestationV2(swapped)).toBe(false);
  });

  it("never throws on garbage", async () => {
    expect(await verifyAttestationV2({} as SolanaAttestationV2)).toBe(false);
    expect(
      await verifyAttestationV2({ v: 2, app: "vesper", chain: "solana" } as SolanaAttestationV2),
    ).toBe(false);
  });
});
