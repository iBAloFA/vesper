import { describe, expect, it } from "vitest";
import { createKeeper, signMessage, verifyMessage } from "../src/lib/proof/keeper";
import {
  LEDGER_GENESIS,
  canonicalLedgerLine,
  ledgerHead,
  verifyLedger,
} from "../src/lib/proof/ledger";
import { planRelease } from "../src/lib/proof/release";
import {
  encodeRevokeData,
  hexToBytes,
  instructionDiscriminator,
  releaseSigil,
} from "../src/lib/proof/solanaMint";

const SIGIL = "ab".repeat(32);
const OTHER_SIGIL = "cd".repeat(32);
const REVOKED_AT = "1768037100000";

function signer(keeper: ReturnType<typeof createKeeper>) {
  return (text: string) => signMessage(keeper, text);
}

describe("planRelease", () => {
  it("writes the first entry against the genesis head", async () => {
    const keeper = createKeeper();
    const plan = await planRelease({
      ledgerText: "",
      sigil: SIGIL,
      keeper: keeper.address,
      revokedAt: REVOKED_AT,
      sign: signer(keeper),
      verify: verifyMessage,
    });
    expect(plan.seq).toBe(1);
    expect(plan.prev).toBe(LEDGER_GENESIS);
    expect(plan.text.endsWith("\n")).toBe(true);
    expect(plan.text).toBe(`${canonicalLedgerLine(plan.entry)}\n`);

    const verified = await verifyLedger(plan.text, verifyMessage);
    expect(verified.error).toBeNull();
    expect(verified.entries).toHaveLength(1);
    expect(verified.entries[0].sigil).toBe(SIGIL);
    expect((await ledgerHead(verified.entries))?.head).toBe(plan.head);
  });

  it("chains a second release to the first head", async () => {
    const keeper = createKeeper();
    const first = await planRelease({
      ledgerText: "",
      sigil: SIGIL,
      keeper: keeper.address,
      revokedAt: REVOKED_AT,
      sign: signer(keeper),
      verify: verifyMessage,
    });
    const second = await planRelease({
      ledgerText: first.text,
      sigil: OTHER_SIGIL,
      keeper: keeper.address,
      revokedAt: "1768037200000",
      sign: signer(keeper),
      verify: verifyMessage,
    });
    expect(second.seq).toBe(2);
    expect(second.prev).toBe(first.head);
    const verified = await verifyLedger(second.text, verifyMessage);
    expect(verified.error).toBeNull();
    expect(verified.entries.map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it("refuses a ledger whose lines were edited", async () => {
    const keeper = createKeeper();
    const first = await planRelease({
      ledgerText: "",
      sigil: SIGIL,
      keeper: keeper.address,
      revokedAt: REVOKED_AT,
      sign: signer(keeper),
      verify: verifyMessage,
    });
    const tampered = first.text.replace(SIGIL, OTHER_SIGIL);
    await expect(
      planRelease({
        ledgerText: tampered,
        sigil: OTHER_SIGIL,
        keeper: keeper.address,
        revokedAt: REVOKED_AT,
        sign: signer(keeper),
        verify: verifyMessage,
      }),
    ).rejects.toThrow(/does not verify/);
  });

  it("refuses to release the same sigil twice for one keeper", async () => {
    const keeper = createKeeper();
    const first = await planRelease({
      ledgerText: "",
      sigil: SIGIL,
      keeper: keeper.address,
      revokedAt: REVOKED_AT,
      sign: signer(keeper),
      verify: verifyMessage,
    });
    await expect(
      planRelease({
        ledgerText: first.text,
        sigil: SIGIL,
        keeper: keeper.address,
        revokedAt: REVOKED_AT,
        sign: signer(keeper),
        verify: verifyMessage,
      }),
    ).rejects.toThrow(/already released/);
  });
});

describe("encodeRevokeData", () => {
  it("lays out the arguments in the program's order", async () => {
    const discriminator = await instructionDiscriminator("revoke");
    const sigil = hexToBytes(SIGIL);
    const prev = hexToBytes(LEDGER_GENESIS);
    const head = hexToBytes("ef".repeat(32));
    const data = encodeRevokeData(discriminator, sigil, 7, prev, head);
    expect(data.length).toBe(112);
    expect(Array.from(data.subarray(0, 8))).toEqual(Array.from(discriminator));
    expect(Array.from(data.subarray(8, 40))).toEqual(Array.from(sigil));
    expect(new DataView(data.buffer).getBigUint64(40, true)).toBe(7n);
    expect(Array.from(data.subarray(48, 80))).toEqual(Array.from(prev));
    expect(Array.from(data.subarray(80, 112))).toEqual(Array.from(head));
  });
});

describe("releaseSigil guards", () => {
  it("refuses any cluster other than devnet before touching the network", async () => {
    const keeper = createKeeper();
    await expect(
      releaseSigil({
        keeper,
        sigil: SIGIL,
        program: "94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX",
        rpc: "https://api.mainnet-beta.solana.com",
        cluster: "mainnet-beta",
        seq: 1,
        prev: LEDGER_GENESIS,
        head: "ef".repeat(32),
      }),
    ).rejects.toThrow(/devnet only/);
  });
});
