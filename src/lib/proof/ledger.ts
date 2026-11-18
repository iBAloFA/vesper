export interface LedgerEntry {
  v: 1;
  app: "vesper";
  seq: number;
  sigil: string;
  keeper: string;
  revokedAt: string;
  prev: string;
  signature: string;
}

export type LedgerBody = Omit<LedgerEntry, "signature">;

export const LEDGER_GENESIS = "0".repeat(64);

const HEX_32 = /^[0-9a-f]{64}$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,90}$/;
const DIGITS = /^\d{1,20}$/;

function fail(message: string): never {
  throw new Error(message);
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This environment cannot compute SHA-256.");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalLedgerBody(body: LedgerBody): string {
  if (!Number.isSafeInteger(body.seq) || body.seq < 1) fail("The ledger sequence must start at 1.");
  if (!HEX_32.test(body.sigil)) fail("The sigil must be 32 bytes of lowercase hex.");
  if (!BASE58.test(body.keeper)) fail("The keeper is malformed.");
  if (!DIGITS.test(body.revokedAt)) fail("revokedAt must be a digit-only timestamp.");
  if (!HEX_32.test(body.prev)) fail("The previous hash must be 32 bytes of lowercase hex.");
  return [
    `{"v":1,"app":"vesper","seq":${body.seq}`,
    `"sigil":"${body.sigil}"`,
    `"keeper":"${body.keeper}"`,
    `"revokedAt":"${body.revokedAt}"`,
    `"prev":"${body.prev}"}`,
  ].join(",");
}

export async function ledgerLineHash(line: string): Promise<string> {
  return sha256Hex(line);
}

export async function signLedgerEntry(
  body: LedgerBody,
  sign: (text: string) => string,
): Promise<LedgerEntry> {
  const text = canonicalLedgerBody(body);
  const signature = sign(text);
  const line = `${text.slice(0, -1)},"signature":"${signature}"}`;
  return parseLedgerLine(line) ?? fail("The signed ledger line could not be read back.");
}

export function parseLedgerLine(line: string): LedgerEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const entry = parsed as Record<string, unknown>;
  if (
    entry.v !== 1 ||
    entry.app !== "vesper" ||
    typeof entry.seq !== "number" ||
    typeof entry.sigil !== "string" ||
    typeof entry.keeper !== "string" ||
    typeof entry.revokedAt !== "string" ||
    typeof entry.prev !== "string" ||
    typeof entry.signature !== "string"
  ) {
    return null;
  }
  const candidate: LedgerEntry = {
    v: 1,
    app: "vesper",
    seq: entry.seq,
    sigil: entry.sigil,
    keeper: entry.keeper,
    revokedAt: entry.revokedAt,
    prev: entry.prev,
    signature: entry.signature,
  };
  if (!BASE58.test(candidate.signature)) return null;
  try {
    const rebuilt = `${canonicalLedgerBody(candidate).slice(0, -1)},"signature":"${candidate.signature}"}`;
    return rebuilt === line ? candidate : null;
  } catch {
    return null;
  }
}

export interface LedgerVerification {
  entries: LedgerEntry[];
  error: string | null;
}

export async function verifyLedger(
  text: string,
  verify: (message: string, signature: string, keeper: string) => boolean,
): Promise<LedgerVerification> {
  const trimmed = text.replace(/\r\n/g, "\n");
  const lines = trimmed.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const entries: LedgerEntry[] = [];
  let prev = LEDGER_GENESIS;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") return { entries, error: `line ${index + 1} is blank` };
    const entry = parseLedgerLine(line);
    if (!entry) return { entries, error: `line ${index + 1} is not a canonical ledger entry` };
    if (entry.seq !== index + 1) {
      return { entries, error: `line ${index + 1} carries sequence ${entry.seq}` };
    }
    if (entry.prev !== prev) {
      return { entries, error: `line ${index + 1} does not follow the previous entry` };
    }
    if (!verify(canonicalLedgerBody(entry), entry.signature, entry.keeper)) {
      return { entries, error: `line ${index + 1} is not signed by its keeper` };
    }
    prev = await ledgerLineHash(line);
    entries.push(entry);
  }
  return { entries, error: null };
}

export function releaseOf(
  entries: LedgerEntry[],
  sigil: string,
  keeper: string,
): LedgerEntry | null {
  return entries.find((entry) => entry.sigil === sigil && entry.keeper === keeper) ?? null;
}

export interface LedgerHead {
  seq: number;
  head: string;
}

export async function ledgerHead(entries: LedgerEntry[]): Promise<LedgerHead | null> {
  if (entries.length === 0) return null;
  const last = entries[entries.length - 1];
  return { seq: last.seq, head: await ledgerLineHash(canonicalLineOf(last)) };
}

function canonicalLineOf(entry: LedgerEntry): string {
  return `${canonicalLedgerBody(entry).slice(0, -1)},"signature":"${entry.signature}"}`;
}

export function formatLedgerDate(revokedAt: string): string {
  const millis = Number(revokedAt);
  if (!Number.isFinite(millis) || millis <= 0) return revokedAt;
  return new Date(millis).toISOString().slice(0, 10);
}

export function ledgerAsOf(entries: LedgerEntry[]): string | null {
  if (entries.length === 0) return null;
  return formatLedgerDate(entries[entries.length - 1].revokedAt);
}
