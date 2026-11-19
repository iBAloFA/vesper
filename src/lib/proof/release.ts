import {
  LEDGER_GENESIS,
  canonicalLedgerLine,
  ledgerHead,
  ledgerLineHash,
  signLedgerEntry,
  verifyLedger,
  type LedgerEntry,
} from "./ledger";

export interface ReleaseInput {
  ledgerText: string;
  sigil: string;
  keeper: string;
  revokedAt: string;
  sign: (text: string) => string;
  verify: (message: string, signature: string, keeper: string) => boolean;
}

export interface ReleasePlan {
  entry: LedgerEntry;
  seq: number;
  prev: string;
  head: string;
  text: string;
}

export async function planRelease(input: ReleaseInput): Promise<ReleasePlan> {
  const verified = await verifyLedger(input.ledgerText, input.verify);
  if (verified.error) {
    throw new Error(`The ledger file does not verify (${verified.error}), so nothing was signed.`);
  }
  if (verified.entries.some((entry) => entry.sigil === input.sigil && entry.keeper === input.keeper)) {
    throw new Error("This keeper already released this sigil in the ledger file you hold.");
  }
  const head = await ledgerHead(verified.entries);
  const seq = (head?.seq ?? 0) + 1;
  const prev = head?.head ?? LEDGER_GENESIS;
  const entry = await signLedgerEntry(
    {
      v: 1,
      app: "vesper",
      seq,
      sigil: input.sigil,
      keeper: input.keeper,
      revokedAt: input.revokedAt,
      prev,
    },
    input.sign,
  );
  const line = canonicalLedgerLine(entry);
  const base = input.ledgerText.replace(/\r\n/g, "\n");
  const text = base === "" || base.endsWith("\n") ? `${base}${line}\n` : `${base}\n${line}\n`;
  return { entry, seq, prev, head: await ledgerLineHash(line), text };
}
