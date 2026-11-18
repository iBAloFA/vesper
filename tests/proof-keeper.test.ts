import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import {
  createKeeper,
  keeperFromSecret,
  signMessage,
  verifyMessage,
} from "../src/lib/proof/keeper";

const MESSAGE = "vesper.vigil.v2\ncluster=devnet\nseal=cd";

describe("solana keeper", () => {
  it("derives a base58 address from a 32-byte public key", () => {
    const keeper = createKeeper();
    expect(bs58.decode(keeper.address)).toHaveLength(32);
    expect(keeper.secretKey).toHaveLength(64);
    expect(keeperFromSecret(keeper.secretKey).address).toBe(keeper.address);
  });

  it("signs and verifies the canonical message", () => {
    const keeper = createKeeper();
    const signature = signMessage(keeper, MESSAGE);
    expect(bs58.decode(signature)).toHaveLength(64);
    expect(verifyMessage(MESSAGE, signature, keeper.address)).toBe(true);
  });

  it("rejects another keeper, an altered message, and a truncated signature", () => {
    const keeper = createKeeper();
    const other = createKeeper();
    const signature = signMessage(keeper, MESSAGE);
    expect(verifyMessage(MESSAGE, signature, other.address)).toBe(false);
    expect(verifyMessage(`${MESSAGE} `, signature, keeper.address)).toBe(false);
    expect(verifyMessage(MESSAGE, signature.slice(0, 80), keeper.address)).toBe(false);
    expect(verifyMessage(MESSAGE, "not base58!", keeper.address)).toBe(false);
    expect(verifyMessage(MESSAGE, signature, "not base58!")).toBe(false);
  });

  it("refuses a secret of the wrong size", () => {
    expect(() => keeperFromSecret(new Uint8Array(32))).toThrow(/Ed25519/);
  });
});
