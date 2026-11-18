import { describe, expect, it } from "vitest";
import { parseVaultImport } from "../src/lib/storage";
import { sealVigilV2 } from "../src/lib/proof/attestationV2";
import { createKeeper } from "../src/lib/proof/keeper";
import { makeVigil } from "./fixtures";

async function v2Vigil(overrides: { program?: string | null; cluster?: string } = {}) {
  const base = makeVigil({ id: "storage-v2", intention: "Finish the chapter" });
  const keeper = createKeeper();
  const { attestation, seal, sigil } = await sealVigilV2({
    vigil: base,
    keeper,
    cluster: overrides.cluster ?? "devnet",
    program: overrides.program ?? null,
    clockDriftMs: 40,
  });
  return { ...base, sealV2: seal, clockDriftMs: 40, solana: { sigil, attestation } };
}

function archive(vigils: unknown[]): string {
  return JSON.stringify({ app: "vesper", version: 1, vigils });
}

describe("archives with v2 records", () => {
  it("keeps v1 and v2 fields in one import", async () => {
    const v2 = await v2Vigil();
    const v1 = makeVigil({ id: "storage-v1" });
    const vault = parseVaultImport(archive([v1, v2]));
    expect(vault.vigils).toHaveLength(2);
    const [first, second] = vault.vigils;
    expect(first.sealV2).toBeUndefined();
    expect(second.sealV2).toBe(v2.sealV2);
    expect(second.clockDriftMs).toBe(40);
    expect(second.solana?.sigil).toBe(v2.solana.sigil);
    expect(second.solana?.attestation.signature).toBe(v2.solana.attestation.signature);
  });

  it("drops a v2 record whose seal disagrees with the attestation", async () => {
    const v2 = await v2Vigil();
    const vault = parseVaultImport(
      archive([{ ...v2, sealV2: "00".repeat(32) }]),
    );
    expect(vault.vigils[0].solana).toBeUndefined();
    expect(vault.vigils[0].sealV2).toBe("00".repeat(32));
  });

  it("keeps the vigil but drops malformed v2 fields", async () => {
    const v2 = await v2Vigil();
    const vault = parseVaultImport(
      archive([
        {
          ...v2,
          sealV2: "NOT HEX",
          clockDriftMs: 1.5,
          solana: {
            ...v2.solana,
            attestation: { ...v2.solana.attestation, v: 1 },
          },
        },
      ]),
    );
    expect(vault.vigils).toHaveLength(1);
    expect(vault.vigils[0].sealV2).toBeUndefined();
    expect(vault.vigils[0].clockDriftMs).toBeUndefined();
    expect(vault.vigils[0].solana).toBeUndefined();
  });
});
