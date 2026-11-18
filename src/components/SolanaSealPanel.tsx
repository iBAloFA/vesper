import { useEffect, useState } from "react";
import { shortHash } from "../lib/attestation";
import { copyText, downloadText, slugify } from "../lib/files";
import {
  assembleAttestationV2,
  attestationV2Json,
  draftAttestationV2,
  sealVigilV2,
  verifyAttestationV2,
} from "../lib/proof/attestationV2";
import { MIN_PASSPHRASE_LENGTH } from "../lib/proof/keeperStore";
import { SOLANA } from "../lib/site";
import type { Vigil } from "../lib/types";
import { shortAddress } from "../lib/wallet";
import { useSolanaKeeper } from "../hooks/useSolanaKeeper";
import { useSolanaWallet } from "../hooks/useSolanaWallet";
import { useApp } from "../state/AppContext";

type Check = "idle" | "checking" | "valid" | "invalid";
type Busy = "forge" | "unlock" | "seal" | "wallet" | null;

function calm(error: unknown): string {
  const text = error instanceof Error ? error.message : "";
  if (/reject|deny|denied|declin|cancel/i.test(text)) return "The wallet declined. Nothing was sealed.";
  return text || "The wallet did not sign. Nothing was sealed.";
}

export function SolanaSealPanel({ vigil, recordIntact }: { vigil: Vigil; recordIntact: boolean }) {
  const { vault, toast } = useApp();
  const local = useSolanaKeeper();
  const wallet = useSolanaWallet(SOLANA.cluster);
  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [check, setCheck] = useState<Check>("idle");

  const record = vigil.solana ?? null;
  const attestation = record?.attestation ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!attestation) {
      setCheck("idle");
      return;
    }
    setCheck("checking");
    void verifyAttestationV2(attestation).then((valid) => {
      if (!cancelled) setCheck(valid ? "valid" : "invalid");
    });
    return () => {
      cancelled = true;
    };
  }, [attestation]);

  const forge = async () => {
    if (passphrase !== repeat) {
      toast("The two passphrases differ.", "error");
      return;
    }
    setBusy("forge");
    try {
      await local.forge(passphrase);
      setPassphrase("");
      setRepeat("");
      toast("A keeper was forged and wrapped in this browser.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The keeper could not be forged.", "error");
    } finally {
      setBusy(null);
    }
  };

  const unlock = async () => {
    setBusy("unlock");
    try {
      await local.unlock(passphrase);
      setPassphrase("");
      toast("The keeper is open for this visit.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The keeper would not open.", "error");
    } finally {
      setBusy(null);
    }
  };

  const seal = async () => {
    if (!local.keeper) return;
    setBusy("seal");
    try {
      const sealed = await sealVigilV2({
        vigil,
        keeper: local.keeper,
        cluster: SOLANA.cluster,
        program: SOLANA.program,
        clockDriftMs: vigil.clockDriftMs ?? null,
      });
      if (!(await verifyAttestationV2(sealed.attestation))) {
        throw new Error("The new attestation did not verify, so nothing was kept.");
      }
      vault.updateVigil(vigil.id, {
        sealV2: sealed.seal,
        solana: { sigil: sealed.sigil, attestation: sealed.attestation },
      });
      toast("The sigil is sealed. The attestation verifies in this browser.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The seal did not take.", "error");
    } finally {
      setBusy(null);
    }
  };

  const sealWithWallet = async (name: string) => {
    setBusy("wallet");
    try {
      const connected = await wallet.connect(name);
      const draft = await draftAttestationV2({
        vigil,
        keeper: connected.address,
        cluster: SOLANA.cluster,
        program: SOLANA.program,
        clockDriftMs: vigil.clockDriftMs ?? null,
      });
      const signature = await connected.sign(draft.message);
      const attestation = assembleAttestationV2(draft, signature);
      if (!(await verifyAttestationV2(attestation))) {
        throw new Error("The attestation did not verify, so nothing was kept.");
      }
      vault.updateVigil(vigil.id, {
        sealV2: attestation.seal,
        solana: { sigil: draft.sigil, attestation },
      });
      toast(`The sigil is sealed by ${connected.name}. The attestation verifies in this browser.`, "success");
    } catch (error) {
      toast(calm(error), "error");
    } finally {
      setBusy(null);
    }
  };

  const checkLabel: Record<Check, string> = {    idle: "unsigned",
    checking: "checking signature…",
    valid: "signature verified",
    invalid: "signature does not match",
  };

  const fileName = `${slugify(vigil.intention || "vesper-vigil")}-${vigil.id.slice(0, 8)}`;

  return (
    <section className="surface return__solana" aria-label="Solana seal">
      <div className="return__attestation-head">
        <div>
          <p className="kicker">Proof of focus · Solana</p>
          <h2>Sigil on Solana</h2>
        </div>
        <span
          className={`status-chip ${
            check === "valid" ? "is-good" : check === "invalid" ? "is-bad" : ""
          }`}
        >
          <span className="dot" /> {checkLabel[check]}
        </span>
      </div>

      <div className="meta-chips">
        <span className="tag">solana · {SOLANA.cluster}</span>
        <span className="tag tag--muted">
          {SOLANA.program ? `program ${shortAddress(SOLANA.program)}` : "program unminted"}
        </span>
        {local.address ? (
          <span className="tag">keeper {shortAddress(local.address)}</span>
        ) : null}
      </div>

      <p className="attestation__copy">
        Sealing signs one canonical message with an Ed25519 key that lives only in this browser: the
        cluster, the sigil id, your keeper, the start time, duration, focused seconds, outcome, clock
        evidence and the seal. It verifies offline. Nothing is sent to the cluster by sealing.
      </p>

      {attestation ? (
        <>
          <dl className="facts">
            <div>
              <dt>Keeper</dt>
              <dd>{shortAddress(attestation.keeper)}</dd>
            </div>
            <div>
              <dt>Cluster</dt>
              <dd>{attestation.cluster}</dd>
            </div>
            <div>
              <dt>Program</dt>
              <dd>{attestation.program ? shortAddress(attestation.program) : "unminted"}</dd>
            </div>
            <div>
              <dt>Sigil</dt>
              <dd className="hash">{shortHash(record?.sigil ?? "", 10, 8)}</dd>
            </div>
            <div className="facts__wide">
              <dt>Seal</dt>
              <dd className="hash">{shortHash(attestation.seal, 18, 14)}</dd>
            </div>
            <div className="facts__wide">
              <dt>Signature</dt>
              <dd className="hash">{shortHash(attestation.signature, 18, 14)}</dd>
            </div>
          </dl>
          <div className="button-row">
            <button
              className="btn btn--primary"
              type="button"
              onClick={async () => {
                const copied = await copyText(attestationV2Json(attestation));
                toast(
                  copied ? "Attestation JSON copied." : "The clipboard refused. Try the download.",
                  copied ? "success" : "error",
                );
              }}
            >
              Copy attestation.json
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                downloadText(`${fileName}-solana-attestation.json`, attestationV2Json(attestation));
                toast("The attestation was written to a file.", "success");
              }}
            >
              Download JSON
            </button>
            <button
              className="btn btn--quiet"
              type="button"
              onClick={async () => {
                const valid = await verifyAttestationV2(attestation);
                toast(
                  valid ? "The signature matches the keeper and the seal." : "The signature does not match.",
                  valid ? "success" : "error",
                );
              }}
            >
              Verify again
            </button>
          </div>
        </>
      ) : (
        <>
          {local.keeper ? (
            <div className="seal-actions">
              <button
                className="btn btn--primary"
                type="button"
                disabled={busy !== null || !recordIntact}
                onClick={() => void seal()}
              >
                {busy === "seal" ? "Sealing…" : "Seal with the local keeper"}
              </button>
              <button className="btn btn--quiet" type="button" onClick={local.lock}>
                Lock keeper
              </button>
            </div>
          ) : local.locked ? (
            <form
              className="keeper-form"
              onSubmit={(event) => {
                event.preventDefault();
                void unlock();
              }}
            >
              <div className="field">
                <label htmlFor="solana-unlock">Passphrase</label>
                <input
                  id="solana-unlock"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              </div>
              <button className="btn btn--primary" type="submit" disabled={busy !== null}>
                {busy === "unlock" ? "Opening…" : "Unlock keeper"}
              </button>
            </form>
          ) : (
            <>
              <form
                className="keeper-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void forge();
                }}
              >
                <div className="field">
                  <label htmlFor="solana-passphrase">Passphrase</label>
                  <input
                    id="solana-passphrase"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="solana-passphrase-repeat">Repeat it</label>
                  <input
                    id="solana-passphrase-repeat"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={repeat}
                    onChange={(event) => setRepeat(event.target.value)}
                  />
                </div>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={
                    busy !== null ||
                    !recordIntact ||
                    passphrase.length < MIN_PASSPHRASE_LENGTH ||
                    passphrase !== repeat
                  }
                >
                  {busy === "forge" ? "Forging…" : "Forge a keeper"}
                </button>
              </form>
              <p className="hint">
                The keeper is a fresh Ed25519 key, wrapped with your passphrase of at least{" "}
                {MIN_PASSPHRASE_LENGTH} characters before it touches storage. The passphrase is never
                stored. If it is lost, the keeper cannot sign again; records already sealed stay
                verifiable.
              </p>
            </>
          )}

          {local.locked ? (
            <p className="hint">
              The keeper {shortAddress(local.address ?? "")} is locked. It opens for this visit only
              and locks again after fifteen minutes of stillness.
            </p>
          ) : null}
          {wallet.names.length > 0 ? (
            <>
              <div className="seal-actions">
                {wallet.names.map((name) => (
                  <button
                    key={name}
                    className="btn btn--ghost"
                    type="button"
                    disabled={busy !== null || !recordIntact}
                    onClick={() => void sealWithWallet(name)}
                  >
                    {busy === "wallet" ? "Waiting for the wallet…" : `Seal with ${name}`}
                  </button>
                ))}
              </div>
              <p className="hint">
                A Solana wallet signs the same message. The signature is checked against the wallet's
                own public key before anything is kept, and nothing is sent to the cluster.
              </p>
            </>
          ) : null}
          {!recordIntact ? (
            <p className="hint">
              This record no longer matches its seal, so nothing will sign it. Remove it or restore
              the archive first.
            </p>
          ) : null}
        </>
      )}

      <div className="chain-note">
        <span className="dot dot--violet" />
        {SOLANA.program ? (
          <span>
            The registry program {shortAddress(SOLANA.program)} on {SOLANA.cluster} is configured.
            Minting to it is not part of this build; the seal exists as a signed record.
          </span>
        ) : (
          <span>
            No registry program is configured in this build. The seal names the cluster and travels as
            a signed record; it stays verifiable with the command-line verifier.
          </span>
        )}
      </div>
    </section>
  );
}
