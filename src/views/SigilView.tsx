import { useEffect, useState } from "react";
import { shortHash } from "../lib/attestation";
import { copyText, downloadText } from "../lib/files";
import {
  artMatches,
  base64,
  deriveSigilAddresses,
  fetchAccountData,
  normalizeSigilId,
  parseArtAccount,
  parseSigilAccount,
  recordJson,
  sigilMetadata,
  OUTCOME_RELEASED,
  type SigilRecord,
} from "../lib/proof/registry";
import { SOLANA } from "../lib/site";
import { shortAddress } from "../lib/wallet";
import { useApp } from "../state/AppContext";

type ArtState =
  | { kind: "ok"; bytes: Uint8Array; text: string }
  | { kind: "missing" }
  | { kind: "unreadable" }
  | { kind: "mismatch" };

type Load =
  | { kind: "checking" }
  | { kind: "invalid"; detail: string }
  | { kind: "missing"; detail: string }
  | { kind: "error"; detail: string }
  | {
      kind: "ready";
      record: SigilRecord;
      addresses: { sigil: string; art: string };
      art: ArtState;
    };

function explorerUrl(address: string): string {
  const cluster = SOLANA.cluster === "mainnet-beta" ? "" : `?cluster=${encodeURIComponent(SOLANA.cluster)}`;
  return `https://explorer.solana.com/address/${address}${cluster}`;
}

function sealedLabel(seconds: number): string {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(seconds * 1000))} UTC`;
}

export function SigilView({ id }: { id: string }) {
  const { toast } = useApp();
  const [load, setLoad] = useState<Load>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: "checking" });
    void (async () => {
      const normalized = normalizeSigilId(id);
      if (!normalized) {
        if (!cancelled) {
          setLoad({
            kind: "invalid",
            detail: id
              ? `“${id}” is not 64 hex characters, so no sigil can answer to it.`
              : "This link carries no sigil id.",
          });
        }
        return;
      }
      if (!SOLANA.program) {
        if (!cancelled) {
          setLoad({
            kind: "error",
            detail: "This build names no registry program, so it cannot read the cluster.",
          });
        }
        return;
      }
      try {
        const addresses = await deriveSigilAddresses(SOLANA.program, normalized);
        const account = await fetchAccountData(SOLANA.rpc, addresses.sigil);
        if (cancelled) return;
        if (!account) {
          setLoad({
            kind: "missing",
            detail: `No sigil account answers at ${shortAddress(addresses.sigil)} on ${SOLANA.cluster}.`,
          });
          return;
        }
        if (account.owner !== SOLANA.program) {
          setLoad({
            kind: "error",
            detail: `The account at ${shortAddress(addresses.sigil)} belongs to ${shortAddress(account.owner)}, not to this program.`,
          });
          return;
        }
        const record = parseSigilAccount(account.data);
        if (!record) {
          setLoad({ kind: "error", detail: "The account exists but does not read as a Vesper sigil record." });
          return;
        }
        if (record.sigilId !== normalized) {
          setLoad({ kind: "error", detail: "The record at this address names a different sigil." });
          return;
        }

        let art: ArtState = { kind: "missing" };
        const artAccount = await fetchAccountData(SOLANA.rpc, addresses.art);
        if (cancelled) return;
        if (artAccount) {
          const bytes = parseArtAccount(artAccount.data);
          if (!bytes) {
            art = { kind: "unreadable" };
          } else if (!(await artMatches(record, bytes))) {
            art = { kind: "mismatch" };
          } else {
            try {
              const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
              art = text.trimStart().startsWith("<svg")
                ? { kind: "ok", bytes, text }
                : { kind: "unreadable" };
            } catch {
              art = { kind: "unreadable" };
            }
          }
        }
        if (!cancelled) setLoad({ kind: "ready", record, addresses, art });
      } catch (error) {
        if (!cancelled) {
          setLoad({
            kind: "error",
            detail: error instanceof Error ? error.message : "The cluster did not answer.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  if (load.kind !== "ready") {
    return (
      <div className="page">
        <div className="page-head">
          <p className="kicker">Proof of focus · Solana</p>
          <h1>A sigil on the cluster.</h1>
          <p className="lede">
            Every minted sigil has a public record: the vigil it came from, the keeper who sealed
            it, and the art itself. This page reads them straight from {SOLANA.cluster}.
          </p>
        </div>
        <div className="surface empty">
          {load.kind === "checking" ? (
            <p className="hint">Reading the cluster…</p>
          ) : (
            <>
              <p>{load.detail}</p>
              {load.kind === "invalid" ? (
                <p className="hint">
                  The id travels in the attestation and in the seal panel. It is 64 hex characters,
                  the same string the metadata URI ends with.
                </p>
              ) : null}
              {load.kind === "missing" ? (
                <p className="hint">
                  Check the id, or the mint on the explorer. A sigil that has not been minted yet,
                  or was minted to another program, will not answer here.
                </p>
              ) : null}
              <div className="button-row">
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => setAttempt((current) => current + 1)}
                >
                  Try again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const { record, addresses, art } = load;
  const outcome = record.outcome === OUTCOME_RELEASED ? "released" : "kept";
  const short = shortHash(record.sigilId, 8, 6);
  const artReady = art.kind === "ok";
  const artLabel =
    art.kind === "ok"
      ? `${record.artLen} bytes · matches the record`
      : art.kind === "mismatch"
        ? "does not match the record"
        : art.kind === "missing"
          ? "not on the cluster"
          : "not readable as an SVG";

  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Proof of focus · Solana</p>
        <h1>A sigil on the cluster.</h1>
        <p className="lede">
          Read from {SOLANA.cluster} without an account: the record, the keeper and the art. The
          signature that binds this sigil to a vigil lives in the attestation, and verifies offline.
        </p>
      </div>

      <section className="surface sigil-view" aria-label={`Sigil ${short}`}>
        <div className="sigil-view__art">
          {artReady ? (
            <img
              src={`data:image/svg+xml;base64,${base64(art.bytes)}`}
              alt={`The sigil ${short}, read from ${SOLANA.cluster}`}
              width={200}
              height={200}
            />
          ) : (
            <div className="sigil-view__missing" role="img" aria-label="The art is not available">
              <span>No art</span>
            </div>
          )}
          <span className={`status-chip ${artReady ? "is-good" : "is-bad"}`}>
            <span className="dot" /> {artLabel}
          </span>
        </div>

        <div className="sigil-view__body">
          <div className="meta-chips">
            <span className="tag">solana · {SOLANA.cluster}</span>
            <span className="tag tag--muted">program {shortAddress(SOLANA.program as string)}</span>
            {record.revoked ? <span className="tag tag--ember">a release exists</span> : null}
          </div>

          <dl className="facts">
            <div>
              <dt>Keeper</dt>
              <dd className="hash">{shortAddress(record.keeper)}</dd>
            </div>
            <div>
              <dt>Mint</dt>
              <dd className="hash">{shortAddress(record.mint)}</dd>
            </div>
            <div>
              <dt>Sealed</dt>
              <dd>{sealedLabel(record.mintedAt)}</dd>
            </div>
            <div>
              <dt>Outcome</dt>
              <dd>{outcome}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>
                {record.durationMin} {record.durationMin === 1 ? "minute" : "minutes"}
              </dd>
            </div>
            <div>
              <dt>Focused</dt>
              <dd>
                {record.focusedSec} {record.focusedSec === 1 ? "second" : "seconds"}
              </dd>
            </div>
            <div>
              <dt>Sigil</dt>
              <dd className="hash">{shortHash(record.sigilId, 10, 8)}</dd>
            </div>
            <div>
              <dt>Art</dt>
              <dd>{record.artLen} bytes</dd>
            </div>
            <div className="facts__wide">
              <dt>Seal</dt>
              <dd className="hash">{shortHash(record.seal, 18, 14)}</dd>
            </div>
            <div className="facts__wide">
              <dt>Message hash</dt>
              <dd className="hash">{shortHash(record.messageHash, 18, 14)}</dd>
            </div>
            <div className="facts__wide">
              <dt>Art hash</dt>
              <dd className="hash">{shortHash(record.artHash, 18, 14)}</dd>
            </div>
          </dl>

          <div className="button-row">
            <button
              className="btn btn--ghost"
              type="button"
              onClick={async () => {
                const copied = await copyText(recordJson(record));
                toast(
                  copied ? "The record was copied as JSON." : "The clipboard refused. Try a download.",
                  copied ? "success" : "error",
                );
              }}
            >
              Copy record
            </button>
            {artReady ? (
              <>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => {
                    downloadText(`vesper-sigil-${record.sigilId.slice(0, 12)}.svg`, art.text, "image/svg+xml");
                    toast("The art was written to a file.", "success");
                  }}
                >
                  Download art
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => {
                    downloadText(
                      `vesper-sigil-${record.sigilId.slice(0, 12)}-metadata.json`,
                      `${JSON.stringify(sigilMetadata(record, art.bytes), null, 2)}\n`,
                    );
                    toast("A metadata document with the art embedded was written.", "success");
                  }}
                >
                  Download metadata
                </button>
              </>
            ) : null}
            <a
              className="btn btn--quiet"
              href={explorerUrl(record.mint)}
              target="_blank"
              rel="noreferrer"
            >
              Open the mint
            </a>
          </div>

          {art.kind === "mismatch" ? (
            <p className="hint">
              The bytes in the art account do not hash to the record, so they are not shown. The
              record stands; the art needs a keeper to write it again.
            </p>
          ) : null}
          {art.kind === "missing" ? (
            <p className="hint">
              The record is on-chain, but its art was never written or is still being written. Only
              the keeper who sealed it can finish the art.
            </p>
          ) : null}

          <div className="chain-note">
            <span className="dot dot--violet" />
            <span>
              The cluster can tell you this record exists, who holds the mint, and that the art is
              intact. It cannot tell you the vigil happened: that claim lives in the keeper's
              attestation, which verifies offline with{" "}
              <code>npm run verify:attestation</code>. A release is a signed notice in the ledger,
              not a proof.
            </span>
          </div>
          <p className="hint">
            Sigil account {shortAddress(addresses.sigil)} · art account{" "}
            {shortAddress(addresses.art)}
          </p>
        </div>
      </section>
    </div>
  );
}
