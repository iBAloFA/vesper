import { useEffect, useState } from "react";
import { Sigil } from "../components/Sigil";
import {
  attestationJson,
  shortHash,
  verifyAttestation,
  verifySeal,
} from "../lib/attestation";
import { copyText, downloadText, slugify } from "../lib/files";
import { sigilSvg } from "../lib/sigil";
import { hasConfiguredContract, SITE } from "../lib/site";
import { formatDateTime, formatDuration, formatMinutesShort, relativeDay } from "../lib/time";
import { signVigil, shortAddress, walletKindLabel } from "../lib/wallet";
import type { WalletRecord } from "../lib/types";
import { useApp } from "../state/AppContext";

type Verification = "idle" | "checking" | "valid" | "invalid";

export function ReturnView() {
  const { returnVigil, vault, wallet, toast, clearReturn, navigate } = useApp();
  const [verification, setVerification] = useState<Verification>("idle");
  const [busy, setBusy] = useState(false);

  const attestation = returnVigil?.attestation ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!attestation) {
      setVerification("idle");
      return;
    }
    setVerification("checking");
    void verifyAttestation(attestation).then((valid) => {
      if (!cancelled) setVerification(valid ? "valid" : "invalid");
    });
    return () => {
      cancelled = true;
    };
  }, [attestation]);

  if (!returnVigil) {
    return (
      <div className="page">
        <div className="surface empty">
          <p className="kicker">The return</p>
          <h1>Nothing has returned yet.</h1>
          <p className="lede">
            A vigil has to be kept before the house gives anything back. Light the candle, or walk
            through the crypt to find an older sigil.
          </p>
          <div className="button-row">
            <button className="btn btn--primary" type="button" onClick={() => navigate("/vigil")}>
              Begin a vigil
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => navigate("/crypt")}>
              Enter the crypt
            </button>
          </div>
        </div>
      </div>
    );
  }

  const vigil = returnVigil;
  const sealValid = verifySeal(vigil);
  const fileName = `${slugify(vigil.intention || "vesper-vigil")}-${vigil.id.slice(0, 8)}`;

  const sealVigil = async (record: WalletRecord) => {
    setBusy(true);
    try {
      const next = await signVigil(record, vigil, SITE.contract || undefined);
      vault.updateVigil(vigil.id, { attestation: next });
      toast("The sigil is sealed. The attestation verifies locally.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The signature did not take.", "error");
    } finally {
      setBusy(false);
    }
  };

  const forgeAndSeal = () => {
    const record = wallet.createKeeper();
    toast("A local keeper was forged in this browser.", "info");
    void sealVigil(record);
  };

  const connectAndSeal = async () => {
    setBusy(true);
    try {
      const record = await wallet.connectBrowserWallet();
      await sealVigil(record);
    } catch (error) {
      toast(error instanceof Error ? error.message : "The wallet would not open.", "error");
      setBusy(false);
    }
  };

  const verificationLabel: Record<Verification, string> = {
    idle: "unsigned",
    checking: "checking signature…",
    valid: "signature verified",
    invalid: "signature does not match",
  };

  return (
    <div className="page return">
      <header className="page-head">
        <p className="kicker">The return · {relativeDay(vigil.startedAt)}</p>
        <h1>{vigil.intention || "An unnamed vigil"}</h1>
        <div className="meta-chips">
          <span className={`tag ${vigil.completed ? "tag--ember" : ""}`}>
            {vigil.completed ? "kept" : "released early"}
          </span>
          <span className="tag">{formatDuration(vigil.plannedMin)}</span>
          <span className="tag">{formatMinutesShort(Math.round(vigil.focusedSec / 60))} focused</span>
          <span className="tag">{formatDateTime(vigil.startedAt)}</span>
          {vigil.sample ? <span className="tag tag--muted">sample record</span> : null}
        </div>
      </header>

      <div className="return__grid">
        <section className="surface return__sigil" aria-label="Sigil">
          <Sigil seed={vigil.seal} size={340} title="The sigil of this vigil" />
          <p className="mono-label">seal</p>
          <p className="hash">{shortHash(vigil.seal, 12, 10)}</p>
          <div className={`status-chip ${sealValid ? "is-good" : "is-bad"}`}>
            <span className="dot" /> {sealValid ? "seal matches record" : "record altered"}
          </div>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              downloadText(`${fileName}.svg`, sigilSvg(vigil.seal, 512), "image/svg+xml");
              toast("The sigil was drawn to a file.", "success");
            }}
          >
            Download sigil.svg
          </button>
        </section>

        <section className="surface return__transmission" aria-label="Transmission">
          <p className="kicker">Transmission</p>
          <blockquote>
            <span className="quote-mark" aria-hidden="true">
              “
            </span>
            {vigil.transmission}
          </blockquote>
          <p className="hint">
            Composed once, from this vigil alone. It will not be written again.
          </p>
        </section>

        <section className="surface return__attestation" aria-label="Attestation">
          <div className="return__attestation-head">
            <div>
              <p className="kicker">Proof of focus</p>
              <h2>Wallet attestation</h2>
            </div>
            <span
              className={`status-chip ${
                verification === "valid" ? "is-good" : verification === "invalid" ? "is-bad" : ""
              }`}
            >
              <span className="dot" /> {verificationLabel[verification]}
            </span>
          </div>

          <p className="attestation__copy">
            Sealing signs a typed EIP-712 message: the vigil's hashed id, your keeper address, the
            start time, duration and seal. The signature is checked in this browser, and nothing is
            uploaded.
          </p>

          {attestation ? (
            <>
              <dl className="facts">
                <div>
                  <dt>Keeper</dt>
                  <dd>{shortAddress(attestation.address)}</dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>{walletKindLabel(attestation.kind)}</dd>
                </div>
                <div>
                  <dt>Chain</dt>
                  <dd>{attestation.chainId}</dd>
                </div>
                <div>
                  <dt>Signed</dt>
                  <dd>{formatDateTime(attestation.signedAt)}</dd>
                </div>
                <div className="facts__wide">
                  <dt>Signature</dt>
                  <dd className="hash">{shortHash(attestation.signature, 14, 12)}</dd>
                </div>
              </dl>
              <div className="button-row">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={async () => {
                    const copied = await copyText(attestationJson(attestation));
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
                    downloadText(`${fileName}-attestation.json`, attestationJson(attestation));
                    toast("The attestation was written to a file.", "success");
                  }}
                >
                  Download JSON
                </button>
                <button
                  className="btn btn--quiet"
                  type="button"
                  onClick={async () => {
                    const valid = await verifyAttestation(attestation);
                    toast(
                      valid ? "The signature recovers to the keeper." : "The signature does not match.",
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
              <div className="seal-actions">
                {wallet.wallet ? (
                  <button
                    className="btn btn--primary"
                    type="button"
                    disabled={busy || !sealValid}
                    onClick={() => void sealVigil(wallet.wallet as WalletRecord)}
                  >
                    {busy
                      ? "Signing…"
                      : `Seal with ${walletKindLabel(wallet.wallet.kind).toLowerCase()}`}
                  </button>
                ) : (
                  <>
                    <button
                      className="btn btn--primary"
                      type="button"
                      disabled={busy || !sealValid}
                      onClick={forgeAndSeal}
                    >
                      {busy ? "Forging…" : "Forge a local keeper & seal"}
                    </button>
                    {wallet.injectedAvailable ? (
                      <button
                        className="btn btn--ghost"
                        type="button"
                        disabled={busy || !sealValid}
                        onClick={() => void connectAndSeal()}
                      >
                        Connect a browser wallet
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              <p className="hint">
                A local keeper is a fresh key generated in this browser. Its private key never leaves
                this device. You can also keep the vigil unsigned — the sigil will still exist.
              </p>
            </>
          )}

          <div className="chain-note">
            <span className="dot dot--violet" />
            {hasConfiguredContract ? (
              <span>
                On-chain registry configured at {shortAddress(SITE.contract)} on chain {SITE.chainId}.
                Minting is optional and separate from this signature.
              </span>
            ) : (
              <span>
                This build verifies signatures in-app. The soulbound ERC-721 registry ships with the
                repository for deployments that want an on-chain record.
              </span>
            )}
          </div>
        </section>
      </div>

      <div className="button-row return__actions">
        <button className="btn btn--primary" type="button" onClick={() => clearReturn("/crypt")}>
          Enter the crypt
        </button>
        <button className="btn btn--ghost" type="button" onClick={() => clearReturn("/vigil")}>
          Keep another vigil
        </button>
      </div>
    </div>
  );
}
