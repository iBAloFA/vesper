import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import { createKeeper } from "../src/lib/proof/keeper";
import {
  deriveSigilAddress,
  ledgerDiscriminator,
  lookupLedger,
  lookupSigil,
  parseLedgerAccount,
  parseSigilAccount,
  sigilDiscriminator,
} from "../scripts/verify-solana";

const PROGRAM = "11111111111111111111111111111111";
const SIGIL = "ab".repeat(32);

function account(options: { revoked?: boolean } = {}): Uint8Array {
  const keeper = createKeeper();
  const mint = createKeeper();
  const data = new Uint8Array(221);
  data.set(sigilDiscriminator(), 0);
  data.set(keeper.publicKey, 40);
  data.set(mint.publicKey, 188);
  data[187] = options.revoked ? 1 : 0;
  return data;
}

describe("sigil accounts", () => {  it("reads keeper, mint, and revocation from the designed layout", () => {
    const data = account({ revoked: true });
    const state = parseSigilAccount(data);
    expect(state).not.toBeNull();
    expect(bs58.decode(state!.keeper)).toEqual(data.subarray(40, 72));
    expect(bs58.decode(state!.mint)).toEqual(data.subarray(188, 220));
    expect(state!.revoked).toBe(true);
    expect(parseSigilAccount(account())!.revoked).toBe(false);
  });

  it("rejects the wrong length or a foreign discriminator", () => {
    expect(parseSigilAccount(new Uint8Array(220))).toBeNull();
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

describe("the ledger anchor", () => {
  function ledgerAccount(seq: number, head: string): Uint8Array {
    const data = new Uint8Array(49);
    data.set(ledgerDiscriminator(), 0);
    let value = BigInt(seq);
    for (let index = 8; index <= 15; index += 1) {
      data[index] = Number(value & 0xffn);
      value >>= 8n;
    }
    for (let index = 0; index < 32; index += 1) {
      data[16 + index] = Number.parseInt(head.slice(index * 2, index * 2 + 2), 16);
    }
    return data;
  }

  it("reads the sequence and head from the designed layout", () => {
    const head = "9f".repeat(32);
    expect(parseLedgerAccount(ledgerAccount(7, head))).toEqual({ seq: 7, head });
    expect(parseLedgerAccount(new Uint8Array(48))).toBeNull();
    const wrong = ledgerAccount(1, head);
    wrong[0] ^= 0xff;
    expect(parseLedgerAccount(wrong)).toBeNull();
  });

  it("treats a missing ledger account as unanchored", async () => {
    const missing = { getAccountInfo: async () => null };
    expect(await lookupLedger(missing, PROGRAM)).toBe("missing");
  });
});
