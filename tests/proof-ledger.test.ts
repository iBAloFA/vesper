import { describe, expect, it } from "vitest";
import {
  canonicalLedgerBody,
  formatLedgerDate,
  ledgerAsOf,
  ledgerHead,
  ledgerLineHash,
  parseLedgerLine,
  releaseOf,
  signLedgerEntry,
  verifyLedger,
  LEDGER_GENESIS,
  type LedgerEntry,
} from "../src/lib/proof/ledger";
import { createKeeper, signMessage, verifyMessage, type SolanaKeeper } from "../src/lib/proof/keeper";

const SIGIL = "ab".repeat(32);

function lineOf(entry: LedgerEntry): string {
  return `${canonicalLedgerBody(entry).slice(0, -1)},"signature":"${entry.signature}"}`;
}

async function entry(
  seq: number,
  keeper: SolanaKeeper,
  prev: string,
  sigil = SIGIL,
): Promise<LedgerEntry> {
  return signLedgerEntry(
    { v: 1, app: "vesper", seq, sigil, keeper: keeper.address, revokedAt: String(1_763_500_000_000 + seq), prev },
    (text) => signMessage(keeper, text),
  );
}

async function chained(count: number, keeper = createKeeper()): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = [];
  let prev = LEDGER_GENESIS;
  for (let index = 1; index <= count; index += 1) {
    const next = await entry(index, keeper, prev);
    entries.push(next);
    prev = await ledgerLineHash(lineOf(next));
  }
  return entries;
}

function verify(entries: LedgerEntry[]): Promise<{ entries: LedgerEntry[]; error: string | null }> {
  return verifyLedger(entries.map(lineOf).join("\n") + "\n", verifyMessage);
}

describe("the release ledger", () => {
  it("writes a canonical line that reads back exactly", async () => {
    const keeper = createKeeper();
    const first = await entry(1, keeper, LEDGER_GENESIS);
    const line = lineOf(first);
    expect(line).toBe(
      `{"v":1,"app":"vesper","seq":1,"sigil":"${SIGIL}","keeper":"${keeper.address}","revokedAt":"${first.revokedAt}","prev":"${LEDGER_GENESIS}","signature":"${first.signature}"}`,
    );
    expect(parseLedgerLine(line)).toEqual(first);
    expect(await ledgerLineHash(line)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifies a chain and refuses a broken one", async () => {
    const entries = await chained(3);
    expect(await verify(entries)).toEqual({ entries, error: null });

    const broken = [entries[0], entries[2]];
    const gap = await verify(broken);
    expect(gap.error).toContain("carries sequence 3");

    const reordered = [entries[1], entries[0], entries[2]];
    expect((await verify(reordered)).error).toContain("carries sequence 2");
  });

  it("rejects an edited field, a foreign signer and a loosened line", async () => {
    const keeper = createKeeper();
    const other = createKeeper();
    const first = await entry(1, keeper, LEDGER_GENESIS);

    const edited = lineOf(first).replace('"revokedAt":"', '"revokedAt":"9');
    expect(parseLedgerLine(edited)).not.toBeNull();
    expect((await verifyLedger(edited, verifyMessage)).error).toContain("not signed by its keeper");

    const forged = lineOf(first).replace(`"keeper":"${keeper.address}"`, `"keeper":"${other.address}"`);
    expect(parseLedgerLine(forged)).not.toBeNull();
    expect((await verifyLedger(forged, verifyMessage)).error).toContain("not signed by its keeper");

    const spaced = lineOf(first).replace('{"v":1', '{ "v":1');
    expect(parseLedgerLine(spaced)).toBeNull();
  });

  it("starts a chain at 32 zero bytes and names the head", async () => {
    const keeper = createKeeper();
    const outsider = createKeeper();
    const first = await entry(1, keeper, LEDGER_GENESIS);
    expect(first.prev).toBe(LEDGER_GENESIS);
    expect((await verify([{ ...first, prev: "11".repeat(32) }])).error).toContain("does not follow");

    const entries = await chained(2, keeper);
    const head = await ledgerHead(entries);
    expect(head).toEqual({ seq: 2, head: await ledgerLineHash(lineOf(entries[1])) });
    expect(await ledgerHead([])).toBeNull();

    expect(releaseOf(entries, SIGIL, keeper.address)).not.toBeNull();
    expect(releaseOf(entries, SIGIL, outsider.address)).toBeNull();
    expect(releaseOf(entries, "cd".repeat(32), keeper.address)).toBeNull();
  });

  it("accepts an empty ledger and dates the last release", async () => {
    expect(await verifyLedger("", verifyMessage)).toEqual({ entries: [], error: null });
    expect(ledgerAsOf([])).toBeNull();

    const entries = await chained(2);
    expect(ledgerAsOf(entries)).toBe(formatLedgerDate(entries[1].revokedAt));
    expect(formatLedgerDate("1763500000002")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
