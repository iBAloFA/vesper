import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { createKeeper } from "../src/lib/proof/keeper";
import {
  deriveSigilAddress,
  lookupSigil,
  parseSigilAccount,
  sigilDiscriminator,
} from "../scripts/verify-solana";

const PROGRAM = "11111111111111111111111111111111";
const SIGIL = "ab".repeat(32);

function account(options: { revoked?: boolean } = {}): Uint8Array {
  const keeper = createKeeper();
  const mint = createKeeper();
  const data = new Uint8Array(217);
  data.set(sigilDiscriminator(), 0);
  data.set(keeper.publicKey, 40);
  data.set(mint.publicKey, 184);
  data[183] = options.revoked ? 1 : 0;
  return data;
}

describe("sigil accounts", () => {
  it("reads keeper, mint, and revocation from the designed layout", () => {
    const data = account({ revoked: true });
    const state = parseSigilAccount(data);
    expect(state).not.toBeNull();
    expect(bs58.decode(state!.keeper)).toEqual(data.subarray(40, 72));
    expect(bs58.decode(state!.mint)).toEqual(data.subarray(184, 216));
    expect(state!.revoked).toBe(true);
    expect(parseSigilAccount(account())!.revoked).toBe(false);
  });

  it("rejects the wrong length or a foreign discriminator", () => {
    expect(parseSigilAccount(new Uint8Array(216))).toBeNull();
    const wrong = account();
    wrong[0] ^= 0xff;
    expect(parseSigilAccount(wrong)).toBeNull();
  });

  it("treats a missing account as unminted", async () => {
    const seen: string[] = [];
    const missing = {
      getAccountInfo: async (address: { toBase58(): string }) => {
        seen.push(address.toBase58());
        return null;
      },
    };
    expect(await lookupSigil(missing, PROGRAM)).toBe("missing");
    expect(seen).toEqual([PROGRAM]);
  });

  it("derives a deterministic sigil address per program", async () => {
    const first = await deriveSigilAddress(PROGRAM, SIGIL);
    expect(first).toEqual(await deriveSigilAddress(PROGRAM, SIGIL));
    expect(first.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(first.address).not.toBe((await deriveSigilAddress(PROGRAM, "cd".repeat(32))).address);
    expect(first.address).not.toBe(
      (await deriveSigilAddress("Sysvar1nstructions1111111111111111111111111", SIGIL)).address,
    );
  });
});
