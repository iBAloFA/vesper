import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildSeal } from "../src/lib/attestation";
import { sealVigilV2 } from "../src/lib/proof/attestationV2";
import { createKeeper } from "../src/lib/proof/keeper";
import { signVigil } from "../src/lib/wallet";
import type { Vigil } from "../src/lib/types";
import { makeVigil } from "./fixtures";

// Hardhat account #0: a publicly known key used only to sign test fixtures.
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const account = privateKeyToAccount(PRIVATE_KEY);
const CLI = "node_modules/tsx/dist/cli.mjs";
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "vesper-verifier-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function sealedVigil(): Promise<Vigil> {
  const base = makeVigil({ id: "verifier-vigil" });
  const seal = buildSeal(base);
  const vigil: Vigil = { ...base, seal };
  const attestation = await signVigil(
    { kind: "local", address: account.address, chainId: 8453, privateKey: PRIVATE_KEY },
    vigil,
  );
  return { ...vigil, attestation };
}

async function writeArchive(name: string, vigils: unknown[]): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, JSON.stringify({ app: "vesper", version: 1, vigils }), "utf8");
  return file;
}

describe("scripts/verify-attestation.ts", () => {
  it("verifies a signed archive and recomputes the seal", async () => {
    const file = await writeArchive("valid.json", [await sealedVigil()]);
    const stdout = execFileSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(stdout).toContain("recovers to the keeper");
    expect(stdout).toContain("matches the record");
    expect(stdout).toContain("✓ 1 of 1 attestations verified");
  });

  it("fails when the record was edited after signing", async () => {
    const vigil = await sealedVigil();
    const file = await writeArchive("tampered.json", [{ ...vigil, intention: "Edited later" }]);
    const result = spawnSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("record was altered");
    expect(result.stderr).toContain("failed verification");
  });

  it("fails on a malformed signature", async () => {
    const vigil = await sealedVigil();
    const attestation = { ...vigil.attestation!, signature: "0xdead" };
    const file = await writeArchive("bad-signature.json", [{ ...vigil, attestation }]);
    const result = spawnSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("signature is malformed");
  });

  it("accepts a file with no sealed vigils", async () => {
    const file = await writeArchive("unsigned.json", [{ ...makeVigil(), attestation: undefined }]);
    const stdout = execFileSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(stdout).toContain("No sealed vigils");
  });
});

describe("scripts/verify-attestation.ts — Solana v2", () => {
  const PROGRAM = "11111111111111111111111111111111";

  async function sealedV2(program: string | null = null) {
    const base = makeVigil({ id: "v2-verifier-vigil", intention: "Finish the chapter" });
    const keeper = createKeeper();
    const { attestation, seal, sigil } = await sealVigilV2({
      vigil: base,
      keeper,
      cluster: "devnet",
      program,
      clockDriftMs: 500,
    });
    return { base, keeper, attestation, seal, sigil };
  }

  async function writeAttestation(name: string, value: unknown): Promise<string> {
    const file = join(dir, name);
    await writeFile(file, JSON.stringify(value), "utf8");
    return file;
  }

  it("verifies the Ed25519 signature, the seal, and the clock label", async () => {
    const { attestation } = await sealedV2();
    const file = await writeAttestation("v2-valid.json", attestation);
    const stdout = execFileSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(stdout).toContain("Ed25519 signature matches the keeper");
    expect(stdout).toContain("matches the record");
    expect(stdout).toContain("clock steady");
    expect(stdout).toContain("✓ 1 of 1 attestations verified");
  });

  it("fails when the record was edited after signing", async () => {
    const { attestation } = await sealedV2();
    const file = await writeAttestation("v2-tampered.json", {
      ...attestation,
      record: { ...attestation.record, intention: "Edited later" },
    });
    const result = spawnSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("record was altered");
    expect(result.stderr).toContain("failed verification");
  });

  it("fails when the keeper was swapped", async () => {
    const { attestation } = await sealedV2();
    const file = await writeAttestation("v2-wrong-keeper.json", {
      ...attestation,
      keeper: createKeeper().address,
    });
    const result = spawnSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("keeper in the message differs");
    expect(result.stdout).toContain("signature does not match the keeper");
  });

  it("accepts a v2 vigil inside an archive and checks the stored seal", async () => {
    const { base, attestation, seal, sigil } = await sealedV2();
    const archive = { app: "vesper", version: 1, vigils: [{ ...base, sealV2: seal, solana: { sigil, attestation } }] };
    const file = await writeAttestation("v2-archive.json", archive);
    const stdout = execFileSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(stdout).toContain("✓ 1 of 1 attestations verified");

    const mismatched = await writeAttestation("v2-archive-mismatch.json", {
      ...archive,
      vigils: [{ ...archive.vigils[0], sealV2: "00".repeat(32) }],
    });
    const result = spawnSync(process.execPath, [CLI, "scripts/verify-attestation.ts", mismatched], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("archived sealV2 differs");
  });

  it("rejects an unknown version instead of guessing", async () => {
    const { attestation } = await sealedV2();
    const file = await writeAttestation("v2-unknown-version.json", { ...attestation, v: 3 });
    const result = spawnSync(process.execPath, [CLI, "scripts/verify-attestation.ts", file], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not an attestation");
  });

  it("reports an unreachable cluster without crashing", async () => {
    const { attestation } = await sealedV2(PROGRAM);
    const file = await writeAttestation("v2-rpc.json", attestation);
    const result = spawnSync(
      process.execPath,
      [CLI, "scripts/verify-attestation.ts", file, "--rpc", "http://127.0.0.1:9"],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("could not reach http://127.0.0.1:9");
  }, 30_000);
});
