import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildSeal } from "../src/lib/attestation";
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
