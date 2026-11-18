import { describe, expect, it } from "vitest";
import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  attestationJson,
  buildSeal,
  buildTypedData,
  messageId,
  shortHash,
  verifyAttestation,
  verifySeal,
} from "../src/lib/attestation";
import { signVigil } from "../src/lib/wallet";
import type { StoredAttestation, WalletRecord } from "../src/lib/types";
import { makeVigil } from "./fixtures";

// Hardhat account #0: a publicly known key used only to sign test fixtures.
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const account = privateKeyToAccount(PRIVATE_KEY);
const wallet: WalletRecord = {
  kind: "local",
  address: account.address,
  chainId: 8453,
  privateKey: PRIVATE_KEY,
};
const VIGIL = makeVigil();
const CONTRACT = "0x2222222222222222222222222222222222222222" as Hex;

async function seal(verifyingContract?: Hex): Promise<StoredAttestation> {
  return signVigil(wallet, VIGIL, verifyingContract);
}

describe("messageId", () => {
  it("hashes the UTF-8 vigil id", () => {
    expect(messageId("vigil-1")).toBe(keccak256(toBytes("vigil-1")));
    expect(messageId("vigil-1")).not.toBe(messageId("vigil-2"));
  });
});

describe("buildSeal", () => {
  it("is deterministic and distinguishes outcome", () => {
    const completed = buildSeal({ ...VIGIL, completed: true });
    const released = buildSeal({ ...VIGIL, completed: false });
    expect(completed).toBe(buildSeal({ ...VIGIL, completed: true }));
    expect(completed).not.toBe(released);
    expect(completed).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes when any signed detail changes", () => {
    const base = buildSeal(VIGIL);
    expect(buildSeal({ ...VIGIL, intention: "Another sentence" })).not.toBe(base);
    expect(buildSeal({ ...VIGIL, focusedSec: 1 })).not.toBe(base);
    expect(buildSeal({ ...VIGIL, ambience: "chapel" })).not.toBe(base);
    expect(buildSeal({ ...VIGIL, startedAt: VIGIL.startedAt + 1 })).not.toBe(base);
  });

  it("verifies only a matching stored seal", () => {
    const sealed = { ...VIGIL, seal: buildSeal(VIGIL) };
    expect(verifySeal(sealed)).toBe(true);
    expect(verifySeal({ ...sealed, intention: "Edited later" })).toBe(false);
  });
});

describe("buildTypedData", () => {
  it("uses the Vesper domain and string startedAt", () => {
    const data = buildTypedData(VIGIL, account.address, 8453);
    expect(data.domain).toEqual({ name: "Vesper", version: "1", chainId: 8453 });
    expect(data.primaryType).toBe("Vigil");
    expect(data.message.startedAt).toBe(String(VIGIL.startedAt));
    expect(data.message.id).toBe(messageId(VIGIL.id));
    expect(data.message.keeper).toBe(account.address);
    expect(data.message.durationMin).toBe(25);
  });

  it("includes the verifying contract when supplied", () => {
    const data = buildTypedData(VIGIL, account.address, 84532, CONTRACT);
    expect(data.domain.verifyingContract).toBe(CONTRACT);
    expect(data.domain.chainId).toBe(84532);
  });

  it("clamps duration into the uint32 contract range", () => {
    expect(buildTypedData({ ...VIGIL, plannedMin: 900 }, account.address, 8453).message.durationMin).toBe(600);
    expect(buildTypedData({ ...VIGIL, plannedMin: 0 }, account.address, 8453).message.durationMin).toBe(1);
  });
});

describe("signVigil and verifyAttestation", () => {
  it("recovers the keeper of a locally signed record", async () => {
    const attestation = await seal();
    expect(attestation.kind).toBe("local");
    expect(attestation.address).toBe(account.address);
    expect(attestation.message.startedAt).toBe(String(VIGIL.startedAt));
    expect(attestation.domain).toEqual({ name: "Vesper", version: "1", chainId: 8453 });
    await expect(verifyAttestation(attestation)).resolves.toBe(true);
  });

  it("binds the signature to the verifying contract", async () => {
    const attestation = await seal(CONTRACT);
    expect(attestation.domain.verifyingContract).toBe(CONTRACT);
    await expect(verifyAttestation(attestation)).resolves.toBe(true);
    await expect(
      verifyAttestation({
        ...attestation,
        domain: { ...attestation.domain, verifyingContract: undefined },
      }),
    ).resolves.toBe(false);
  });

  it("rejects a tampered message", async () => {
    const attestation = await seal();
    await expect(
      verifyAttestation({
        ...attestation,
        message: { ...attestation.message, seal: `0x${"ee".repeat(32)}` },
      }),
    ).resolves.toBe(false);
  });

  it("rejects a keeper that does not match the address", async () => {
    const attestation = await seal();
    await expect(
      verifyAttestation({
        ...attestation,
        address: "0x3333333333333333333333333333333333333333",
      }),
    ).resolves.toBe(false);
  });

  it("rejects invalid duration, startedAt, and signatures", async () => {
    const attestation = await seal();
    await expect(
      verifyAttestation({ ...attestation, message: { ...attestation.message, durationMin: 0 } }),
    ).resolves.toBe(false);
    await expect(
      verifyAttestation({ ...attestation, message: { ...attestation.message, durationMin: 601 } }),
    ).resolves.toBe(false);
    await expect(
      verifyAttestation({ ...attestation, message: { ...attestation.message, startedAt: "-1" } }),
    ).resolves.toBe(false);
    await expect(
      verifyAttestation({ ...attestation, message: { ...attestation.message, startedAt: "12.5" } }),
    ).resolves.toBe(false);
    await expect(
      verifyAttestation({ ...attestation, signature: "0xdead" }),
    ).resolves.toBe(false);
  });
});

describe("attestation formatting", () => {
  it("pretty-prints and shortens hashes", async () => {
    const attestation = await seal();
    const json = attestationJson(attestation);
    expect(json).toContain('\n  "domain"');
    expect(JSON.parse(json)).toEqual(attestation);
    expect(shortHash(attestation.signature)).toBe(
      `${attestation.signature.slice(0, 6)}…${attestation.signature.slice(-4)}`,
    );
    expect(shortHash("0x12")).toBe("0x12");
  });
});
