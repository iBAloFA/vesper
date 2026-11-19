import { useRef, useState } from "react";
import { copyText, downloadText } from "../lib/files";
import { ARCHIVE_URL, hasConfiguredContract, SITE } from "../lib/site";
import { CHANNELS, getAmbience, levelsFor, type AmbienceId, type Levels } from "../lib/types";
import { shortAddress, walletKindLabel } from "../lib/wallet";
import { useApp } from "../state/AppContext";

export function SettingsView() {
  const {
    vault,
    settings,
    wallet,
    soundEnabled,
    soundBusy,
    startSound,
    stopSound,
    applyLevels,
    toast,
    confirm,
    navigate,
  } = useApp();
  const [walletBusy, setWalletBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const setPreset = (id: AmbienceId) => {
    const levels = levelsFor(id);
    vault.updateSettings({ defaultAmbience: id, levels });
    applyLevels(levels);
  };

  const setChannel = (channel: keyof Levels, value: number) => {
    const levels = { ...settings.levels, [channel]: Math.min(1, Math.max(0, value / 100)) };
    vault.updateSettings({ levels });
    applyLevels(levels);
  };

  const exportArchive = () => {
    downloadText(`vesper-archive-${new Date().toISOString().slice(0, 10)}.json`, vault.exportArchive());
    toast("The archive was written to a file.", "success");
  };

  const importArchive = async (file: File) => {
    try {
      const text = await file.text();
      const added = vault.importArchive(text, "merge");
      toast(
        added === 0 ? "No new vigils were found in that archive." : `${added} vigils merged into the crypt.`,
        added === 0 ? "info" : "success",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "That archive could not be read.", "error");
    }
  };

  const connectWallet = async () => {
    setWalletBusy(true);
    try {
      const record = await wallet.connectBrowserWallet();
      toast(`Connected ${shortAddress(record.address)} on chain ${record.chainId}.`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The wallet would not open.", "error");
    } finally {
      setWalletBusy(false);
    }
  };

  return (
    <div className="page settings">
      <header className="page-head">
        <p className="kicker">Settings</p>
        <h1>The room, the keeper, the record.</h1>
        <p className="lede">
          Everything here stays on this device. Vesper has no account, no analytics and no server
          that remembers you.
        </p>
      </header>

      <div className="settings__grid">
        <div className="settings__col">
        <section className="surface settings__section">
          <div className="panel-head">
            <div>
              <p className="kicker">The room</p>
              <h2>Ambience</h2>
            </div>
            <button
              className={`btn ${soundEnabled ? "btn--ghost" : "btn--primary"}`}
              type="button"
              disabled={soundBusy}
              onClick={() => {
                if (soundEnabled) stopSound();
                else void startSound(settings.levels);
              }}
            >
              {soundBusy ? "Waking…" : soundEnabled ? "Silence" : "Hear the room"}
            </button>
          </div>

          <div className="ambience-grid ambience-grid--compact" role="group" aria-label="Default ambience">
            {(["hollow", "downpour", "hearth", "chapel", "still"] as AmbienceId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`ambience ${settings.defaultAmbience === id ? "is-active" : ""}`}
                aria-pressed={settings.defaultAmbience === id}
                onClick={() => setPreset(id)}
              >
                <span className="ambience__name">{getAmbience(id).name}</span>
                <span className="ambience__tagline">{getAmbience(id).tagline}</span>
              </button>
            ))}
          </div>

          <div className="mixer">
            {CHANNELS.map((channel) => (
              <label key={channel.id} className="slider">
                <span className="slider__label">
                  <span>{channel.label}</span>
                  <span className="slider__value">{Math.round(settings.levels[channel.id] * 100)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.levels[channel.id] * 100)}
                  onChange={(event) => setChannel(channel.id, Number(event.target.value))}
                  aria-label={`${channel.label} level`}
                />
              </label>
            ))}
          </div>

          <label className="slider">
            <span className="slider__label">
              <span>Master volume</span>
              <span className="slider__value">{Math.round(settings.masterVolume * 100)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.masterVolume * 100)}
              onChange={(event) => vault.updateSettings({ masterVolume: Number(event.target.value) / 100 })}
              aria-label="Master volume"
            />
          </label>

          <p className="hint">
            Ambience is generated by the Web Audio API in real time — no audio files are downloaded.
            The room starts only after a gesture.
          </p>
        </section>

        <section className="surface settings__section">
          <div className="panel-head">
            <div>
              <p className="kicker">The keeper</p>
              <h2>Wallet & signatures</h2>
            </div>
          </div>

          {wallet.wallet ? (
            <div className="keeper">
              <div className="keeper__identity">
                <span className="keeper__mark" aria-hidden="true">
                  ◈
                </span>
                <div>
                  <p className="keeper__kind">{walletKindLabel(wallet.wallet.kind)}</p>
                  <p className="hash">{wallet.wallet.address}</p>
                  <p className="hint">Chain {wallet.wallet.chainId}</p>
                </div>
              </div>
              <div className="button-row">
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={async () => {
                    const copied = await copyText(wallet.wallet?.address ?? "");
                    toast(copied ? "Address copied." : "The clipboard refused.", copied ? "success" : "error");
                  }}
                >
                  Copy address
                </button>
                <button
                  className="btn btn--quiet"
                  type="button"
                  onClick={() => {
                    wallet.disconnect();
                    toast("The keeper was released from this browser.", "info");
                  }}
                >
                  Disconnect
                </button>
              </div>
              <p className="hint">
                {wallet.wallet.kind === "local"
                  ? "This keeper's private key is stored in local storage for this site only. Export any attestations you want to keep before clearing site data."
                  : "The browser wallet holds the key. Vesper only asks it to sign typed vigil data."}
              </p>
            </div>
          ) : (
            <div className="keeper">
              <p>
                A keeper signs the final attestation. You can forge one locally, or connect a browser
                wallet. Keeping a vigil never requires a wallet.
              </p>
              <div className="button-row">
                <button
                  className="btn btn--primary"
                  type="button"
                  onClick={() => {
                    const record = wallet.createKeeper();
                    toast(`Local keeper forged: ${shortAddress(record.address)}.`, "success");
                  }}
                >
                  Forge a local keeper
                </button>
                {wallet.injectedAvailable ? (
                  <button
                    className="btn btn--ghost"
                    type="button"
                    disabled={walletBusy}
                    onClick={() => void connectWallet()}
                  >
                    {walletBusy ? "Connecting…" : "Connect browser wallet"}
                  </button>
                ) : (
                  <span className="hint">No browser wallet detected.</span>
                )}
              </div>
            </div>
          )}

          <div className="settings__note">
            <p className="kicker">Verification</p>
            <p>
              Attestations use EIP-712 typed data with domain{" "}
              <code>
                {`{ name: "Vesper", version: "1" }`}
              </code>
              . Anyone can recover the signer from the exported JSON without trusting this app.
            </p>
            <p className="hint">
              {hasConfiguredContract
                ? `Soulbound registry: ${shortAddress(SITE.contract)} on chain ${SITE.chainId}.`
                : "The soulbound ERC-721 registry is included in the repository but not configured for this build."}
            </p>
          </div>
        </section>
        </div>

        <div className="settings__col">
        <section className="surface settings__section">
          <div className="panel-head">
            <div>
              <p className="kicker">Preferences</p>
              <h2>How the house behaves</h2>
            </div>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(event) => vault.updateSettings({ reduceMotion: event.target.checked })}
            />
            <span className="toggle__track" aria-hidden="true">
              <span className="toggle__thumb" />
            </span>
            <span>
              <strong>Reduce motion</strong>
              <span className="toggle__hint">
                Stills the dust, flame and constellation movement. Your system preference is also
                respected.
              </span>
            </span>
          </label>

          <div className="settings__note">
            <p className="kicker">A note on the sound</p>
            <p>
              The room is synthesized from filtered noise and oscillators. Bells are placed at
              irregular intervals, so the silence between them never falls into a rhythm you can
              predict.
            </p>
          </div>
        </section>

        <section className="surface settings__section">
          <div className="panel-head">
            <div>
              <p className="kicker">The record</p>
              <h2>Archive & data</h2>
            </div>
            <span className="tag">
              {vault.vault.vigils.length} {vault.vault.vigils.length === 1 ? "vigil" : "vigils"}
            </span>
          </div>

          <div className="data-actions">
            <div className="data-action">
              <div>
                <h3>Export archive</h3>
                <p className="hint">A portable JSON file with every vigil, sigil, seal and attestation.</p>
              </div>
              <button className="btn btn--ghost" type="button" onClick={exportArchive}>
                Export
              </button>
            </div>
            <div className="data-action">
              <div>
                <h3>Import archive</h3>
                <p className="hint">Merges vigils by id. Existing records are kept untouched.</p>
              </div>
              <button className="btn btn--ghost" type="button" onClick={() => fileRef.current?.click()}>
                Import
              </button>
              <input
                ref={fileRef}
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importArchive(file);
                  event.target.value = "";
                }}
              />
            </div>
            <div className="data-action">
              <div>
                <h3>Remembered vigils</h3>
                <p className="hint">Adds sample records so the crypt can be explored. They are marked.</p>
              </div>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  const added = vault.seedSamples();
                  toast(
                    added > 0
                      ? `${added} ${added === 1 ? "sample" : "samples"} added.`
                      : "The samples are already present.",
                    "info",
                  );
                }}
              >
                Add samples
              </button>
            </div>
          </div>

          <div className="danger-zone">
            <p className="kicker">Careful</p>
            <div className="danger-zone__row">
              <div>
                <h3>Clear all vigils</h3>
                <p className="hint">Keeps your settings and keeper.</p>
              </div>
              <button
                className="btn btn--danger"
                type="button"
                onClick={async () => {
                  const confirmed = await confirm({
                    title: "Clear every vigil?",
                    body: "The sigils, transmissions and attestations will be removed from this browser. Export the archive first if you need it.",
                    confirmLabel: "Clear the crypt",
                    danger: true,
                  });
                  if (confirmed) {
                    vault.clearVigils();
                    toast("The crypt is empty again.", "info");
                  }
                }}
              >
                Clear
              </button>
            </div>
            <div className="danger-zone__row">
              <div>
                <h3>Reset everything</h3>
                <p className="hint">Vigils, settings and keeper are removed from this browser.</p>
              </div>
              <button
                className="btn btn--danger"
                type="button"
                onClick={async () => {
                  const confirmed = await confirm({
                    title: "Burn the whole archive?",
                    body: "This clears the vigil archive, settings and any local keeper. It cannot be undone.",
                    confirmLabel: "Reset Vesper",
                    danger: true,
                  });
                  if (confirmed) {
                    stopSound();
                    vault.resetVault();
                    toast("Vesper has been reset.", "info");
                    navigate("/");
                  }
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </section>
        </div>

        <section className="surface settings__section settings__about">
          <div className="panel-head">
            <div>
              <p className="kicker">About</p>
              <h2>Vesper {SITE.version}</h2>
            </div>
            <span className="tag tag--ember">Kiroween · Costume Contest</span>
          </div>
          <p>
            Vesper is a small haunted ritual for focus. It was built with Kiro using spec-driven
            development, steering documents, agent hooks and a Playwright MCP workflow. The public
            repository documents how each piece was used.
          </p>
          <ul className="about-links">
            <li>
              <a className="text-link" href={SITE.repoUrl} target="_blank" rel="noreferrer">
                Public repository <span aria-hidden="true">↗</span>
              </a>
            </li>
            <li>
              <a
                className="text-link"
                href={`${SITE.repoUrl}/blob/main/docs/kiro-usage.md`}
                target="_blank"
                rel="noreferrer"
              >
                How Kiro was used <span aria-hidden="true">↗</span>
              </a>
            </li>
            <li>
              <a className="text-link" href={SITE.kiroweenUrl} target="_blank" rel="noreferrer">
                Kiroween on Devpost <span aria-hidden="true">↗</span>
              </a>
            </li>
            <li>
              <a className="text-link" href={ARCHIVE_URL}>
                v0.1 archive — the build the entry film was made against
              </a>
            </li>
            <li>
              <span className="hint">
                {soundEnabled ? "The room is currently awake." : "The room is quiet."}
              </span>
            </li>
          </ul>
          <p className="hint">
            No accounts. No uploads. No analytics. Your intentions stay in this browser unless you
            export them.
          </p>
        </section>
      </div>

      <div className="settings__footer">
        <p className="hint">Vesper · MIT · Copyright 2026 iBAloFA</p>
      </div>
    </div>
  );
}
