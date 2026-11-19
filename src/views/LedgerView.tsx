import { useCallback, useEffect, useState } from "react";
import { verifyMessage } from "../lib/proof/keeper";
import {
  ledgerAsOf,
  ledgerHead,
  verifyLedger,
  type LedgerEntry,
} from "../lib/proof/ledger";
import { SOLANA } from "../lib/site";
import { shortAddress } from "../lib/wallet";

type HeadCheck =
  | { kind: "off" }
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "match" }
  | { kind: "stale"; detail: string }
  | { kind: "unreachable"; detail: string };

interface Loaded {
  entries: LedgerEntry[];
  error: string | null;
  head: { seq: number; head: string } | null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readAnchoredHead(): Promise<{ seq: number; head: string } | null> {
  const { PublicKey } = await import("@solana/web3.js");
  const [pda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode("ledger")],
    new PublicKey(SOLANA.program as string),
  );
  const response = await fetch(SOLANA.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [pda.toBase58(), { encoding: "base64", commitment: "confirmed" }],
    }),
  });
  if (!response.ok) throw new Error(`The cluster answered ${response.status}.`);
  const payload = (await response.json()) as {
    result?: { value?: { data?: [string, string] } | null };
  };
  const value = payload.result?.value;
  if (!value?.data) return null;
  const bytes = Uint8Array.from(atob(value.data[0]), (char) => char.charCodeAt(0));
  if (bytes.length !== 49) return null;
  const discriminator = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode("account:Ledger")),
  ).slice(0, 8);
  if (discriminator.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { seq: Number(view.getBigUint64(8, true)), head: toHex(bytes.subarray(16, 48)) };
}

export function LedgerView() {
  const [state, setState] = useState<Loaded | null>(null);
  const [check, setCheck] = useState<HeadCheck>({ kind: SOLANA.program ? "checking" : "off" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}revocations.ndjson`, {
          cache: "no-store",
        });
        const text = response.ok ? await response.text() : "";
        const verified = await verifyLedger(text, verifyMessage);
        const head = verified.error ? null : await ledgerHead(verified.entries);
        if (!cancelled) setState({ entries: verified.entries, error: verified.error, head });
      } catch {
        if (!cancelled) {
          setState({ entries: [], error: "The ledger file could not be read.", head: null });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const checkHead = useCallback(async () => {
    if (!SOLANA.program || !state || state.error) return;
    setCheck({ kind: "checking" });
    try {
      const anchored = await readAnchoredHead();
      if (!anchored) {
        setCheck({ kind: "none" });
        return;
      }
      const fileSeq = state.head?.seq ?? 0;
      const fileHead = state.head?.head ?? "0".repeat(64);
      if (anchored.seq === fileSeq && anchored.head === fileHead) {
        setCheck({ kind: "match" });
      } else {
        setCheck({
          kind: "stale",
          detail: `the program holds sequence ${anchored.seq}, this file ends at ${fileSeq}`,
        });
      }
    } catch (error) {
      setCheck({
        kind: "unreachable",
        detail: error instanceof Error ? error.message : "the cluster could not be reached",
      });
    }
  }, [state]);

  useEffect(() => {
    if (state && SOLANA.program && !state.error) void checkHead();
    if (state && !SOLANA.program) setCheck({ kind: "off" });
  }, [state, checkHead]);

  const asOf = state ? ledgerAsOf(state.entries) : null;
  const head = state?.head ?? null;

  const headLabel: Record<HeadCheck["kind"], string> = {
    off: "no program configured",
    checking: "comparing with the program…",
    none: "nothing anchored yet",
    match: "the file's head matches the program",
    stale: "the ledger is stale or altered",
    unreachable: "the program could not be read",
  };

  return (
    <section className="surface" aria-labelledby="ledger-title">
      <div className="page-head">
        <div>
          <p className="kicker">The requiem ledger</p>
          <h1 id="ledger-title">Releases</h1>
        </div>
        <span
          className={`status-chip ${
            check.kind === "match" ? "is-good" : check.kind === "stale" ? "is-bad" : ""
          }`}
        >
          <span className="dot" /> {headLabel[check.kind]}
        </span>
      </div>

      <p className="attestation__copy">
        A sigil is released, never deleted. Each release is a keeper-signed line in a hash-chained
        file, and the file's head is anchored in the program. A release here is a signed notice,
        not proof: a verifier holding an older copy still sees an un-released record, and the "as
        of" date is how stale that copy is.
      </p>

      <div className="meta-chips">
        <span className="tag">solana · {SOLANA.cluster}</span>
        <span className="tag tag--muted">
          {SOLANA.program ? `program ${shortAddress(SOLANA.program)}` : "program unminted"}
        </span>
        {asOf ? <span className="tag">as of {asOf}</span> : null}
        {head ? <span className="tag tag--muted">head {head.head.slice(0, 12)}…</span> : null}
      </div>

      {!state ? (
        <p className="hint">Reading the ledger file…</p>
      ) : state.error ? (
        <p className="hint">The ledger does not verify: {state.error}.</p>
      ) : state.entries.length === 0 ? (
        <p className="hint">
          No release is recorded in this build. Nothing has been released; the file is empty on
          purpose.
        </p>
      ) : (
        <ol className="ledger-list">
          {state.entries.map((entry) => (
            <li key={entry.seq} className="ledger-list__item">
              <span className="ledger-list__seq">#{entry.seq}</span>
              <span className="ledger-list__date">{asOf}</span>
              <span className="ledger-list__keeper">keeper {shortAddress(entry.keeper)}</span>
              <span className="ledger-list__sigil hash">{entry.sigil.slice(0, 16)}…</span>
              <span className="ledger-list__sig hash">{shortAddress(entry.signature)}</span>
            </li>
          ))}
        </ol>
      )}

      {check.kind === "stale" || check.kind === "unreachable" ? (
        <p className="hint">{check.detail}.</p>
      ) : null}

      {SOLANA.program ? (
        <div className="button-row">
          <button
            className="btn btn--quiet"
            type="button"
            disabled={check.kind === "checking" || !state || Boolean(state.error)}
            onClick={() => void checkHead()}
          >
            {check.kind === "checking" ? "Comparing…" : "Compare the head again"}
          </button>
        </div>
      ) : (
        <p className="hint">
          Without a configured program there is no on-chain anchor to compare; the file verifies on
          its own hash chain and signatures alone.
        </p>
      )}
    </section>
  );
}
