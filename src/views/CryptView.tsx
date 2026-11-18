import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { copyText, downloadText } from "../lib/files";
import { hashString } from "../lib/hash";
import { shortHash, verifySeal } from "../lib/attestation";
import { formatDate, formatDateTime, formatDuration, formatMinutesShort, relativeDay } from "../lib/time";
import type { Vigil } from "../lib/types";
import { useApp } from "../state/AppContext";

const CONSTELLATION_WIDTH = 760;
const CONSTELLATION_HEIGHT = 300;

function constellationPoints(vigils: readonly Vigil[]) {
  const list = [...vigils].sort((a, b) => a.startedAt - b.startedAt).slice(-36);
  return list.map((vigil, index) => {
    const t = list.length <= 1 ? 0.5 : index / (list.length - 1);
    const x = 54 + t * (CONSTELLATION_WIDTH - 108);
    const hash = hashString(vigil.seal);
    const y = 42 + ((hash % 997) / 997) * (CONSTELLATION_HEIGHT - 84);
    return { vigil, x, y };
  });
}

export function CryptView() {
  const { vault, stats, openReturn, toast, confirm, navigate } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const vigils = vault.vault.vigils;
  const points = useMemo(() => constellationPoints(vigils), [vigils]);
  const selected = vigils.find((vigil) => vigil.id === selectedId) ?? vigils[0] ?? null;

  const maxMinutes = Math.max(1, ...stats.last7.map((day) => day.minutes));

  const exportArchive = () => {
    downloadText(`vesper-archive-${new Date().toISOString().slice(0, 10)}.json`, vault.exportArchive());
    toast("The archive was written to a file.", "success");
  };

  const importArchive = async (file: File) => {
    try {
      const text = await file.text();
      const added = vault.importArchive(text, "merge");
      toast(
        added === 0
          ? "Those vigils were already in the crypt."
          : `${added} ${added === 1 ? "vigil" : "vigils"} joined the crypt.`,
        "success",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "That archive could not be read.", "error");
    }
  };

  const removeSelected = async () => {
    if (!selected) return;
    const confirmed = await confirm({
      title: "Remove this vigil?",
      body: "The sigil and transmission will be removed from this browser. Export the archive first if you want to keep it.",
      confirmLabel: "Remove it",
      danger: true,
    });
    if (confirmed) {
      vault.removeVigil(selected.id);
      setSelectedId(null);
      toast("The vigil was removed from the crypt.", "info");
    }
  };

  if (vigils.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <p className="kicker">The crypt</p>
          <h1>Nothing has been kept here yet.</h1>
          <p className="lede">
            Every vigil leaves a sigil. When you keep your first one, the constellation begins to
            draw itself across the dark.
          </p>
        </header>
        <div className="surface empty">
          <p className="empty__sigil" aria-hidden="true">
            ✦
          </p>
          <h2>The walls are waiting.</h2>
          <p className="lede">
            You can start with a real vigil now, or fill the crypt with a few remembered ones to see
            how the room looks when it has a history. Samples are clearly marked and easy to remove.
          </p>
          <div className="button-row">
            <button className="btn btn--primary" type="button" onClick={() => navigate("/vigil")}>
              Begin a vigil
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                const added = vault.seedSamples();
                toast(`${added} remembered vigils joined the crypt.`, "success");
              }}
            >
              Fill with remembered vigils
            </button>
          </div>
          <div className="empty__tools">
            <button className="text-link" type="button" onClick={exportArchive}>
              Export an empty archive
            </button>
            <button className="text-link" type="button" onClick={() => fileRef.current?.click()}>
              Import an archive
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
        </div>
      </div>
    );
  }

  return (
    <div className="page crypt">
      <header className="page-head crypt__head">
        <div>
          <p className="kicker">The crypt</p>
          <h1>What the dark kept.</h1>
          <p className="lede">
            {stats.completed} kept · {stats.released} released · {formatMinutesShort(stats.totalMinutes)} of
            focused time. The constellation grows by attention, not by streaks.
          </p>
        </div>
        <div className="button-row crypt__head-actions">
          <button className="btn btn--ghost" type="button" onClick={exportArchive}>
            Export archive
          </button>
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
      </header>

      <div className="stat-grid">
        <div className="stat surface">
          <p className="stat__label">Focus kept</p>
          <p className="stat__value">{formatMinutesShort(stats.totalMinutes)}</p>
          <p className="stat__foot">
            {stats.completed} kept · {stats.released} released
          </p>
        </div>
        <div className="stat surface">
          <p className="stat__label">Current streak</p>
          <p className="stat__value">
            {stats.currentStreak}
            <span className="stat__unit">{stats.currentStreak === 1 ? "day" : "days"}</span>
          </p>
          <p className="stat__foot">
            Best: {stats.bestStreak} {stats.bestStreak === 1 ? "day" : "days"}
          </p>
        </div>
        <div className="stat surface">
          <p className="stat__label">Today</p>
          <p className="stat__value">{stats.focusToday}</p>
          <p className="stat__foot">{stats.focusToday === 1 ? "minute" : "minutes"} kept today</p>
        </div>
        <div className="stat surface">
          <p className="stat__label">Sealed sigils</p>
          <p className="stat__value">
            {stats.sealed}
            <span className="stat__unit">/ {stats.sigils}</span>
          </p>
          <p className="stat__foot">signed attestations</p>
        </div>
      </div>

      <section className="surface chart" aria-label="Focus over the last seven days">
        <div className="chart__head">
          <div>
            <p className="kicker">Last seven days</p>
            <h2>Minutes kept</h2>
          </div>
          <p className="hint">Only completed vigils count toward the streak.</p>
        </div>
        <ol className="chart__bars">
          {stats.last7.map((day) => (
            <li key={day.key} className={day.minutes > 0 ? "has-focus" : ""}>
              <span className="chart__value">{day.minutes > 0 ? day.minutes : ""}</span>
              <span
                className="chart__bar"
                style={{ height: `${Math.max(4, (day.minutes / maxMinutes) * 100)}%` }}
                title={`${day.minutes} minutes on ${day.label}`}
              />
              <span className="chart__label">{day.label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="surface constellation" aria-label="The vigil constellation">
        <div className="constellation__head">
          <div>
            <p className="kicker">The haunting</p>
            <h2>Every vigil leaves a star.</h2>
          </div>
          <ul className="legend">
            <li>
              <span className="legend__dot legend__dot--sealed" /> sealed
            </li>
            <li>
              <span className="legend__dot legend__dot--open" /> unsigned
            </li>
            <li>
              <span className="legend__dot legend__dot--released" /> released
            </li>
          </ul>
        </div>

        <div className="constellation__stage">
          <svg
            className="constellation__svg"
            viewBox={`0 0 ${CONSTELLATION_WIDTH} ${CONSTELLATION_HEIGHT}`}
            role="group"
            aria-label="Constellation of vigils"
          >
            <g stroke="rgba(233, 226, 208, 0.05)" fill="none">
              <ellipse cx="380" cy="150" rx="330" ry="126" />
              <ellipse cx="380" cy="150" rx="238" ry="92" strokeDasharray="2 9" />
              <ellipse cx="380" cy="150" rx="132" ry="52" strokeDasharray="1 12" />
            </g>
            {points.slice(1).map((point, index) => {
              const previous = points[index];
              return (
                <line
                  key={`edge-${point.vigil.id}`}
                  x1={previous.x}
                  y1={previous.y}
                  x2={point.x}
                  y2={point.y}
                  stroke="rgba(233, 226, 208, 0.14)"
                  strokeWidth="0.7"
                />
              );
            })}
            {points.map(({ vigil, x, y }) => {
              const sealed = Boolean(vigil.attestation);
              const color = !vigil.completed ? "#777283" : sealed ? "#e08a4b" : "#e9e2d0";
              const isSelected = selected?.id === vigil.id;
              return (
                <g
                  key={vigil.id}
                  className="constellation__node"
                  role="button"
                  tabIndex={0}
                  aria-label={`${vigil.intention || "Unnamed vigil"} on ${formatDate(vigil.startedAt)}`}
                  onClick={() => setSelectedId(vigil.id)}
                  onKeyDown={(event: ReactKeyboardEvent<SVGGElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(vigil.id);
                    }
                  }}
                >
                  <title>
                    {vigil.intention || "Unnamed vigil"} · {formatDate(vigil.startedAt)} ·{" "}
                    {vigil.completed ? "kept" : "released"}
                  </title>
                  {isSelected ? (
                    <circle cx={x} cy={y} r="14" fill="none" stroke={color} strokeWidth="0.8" opacity="0.5" />
                  ) : null}
                  {sealed ? <circle cx={x} cy={y} r="9" fill={color} opacity="0.08" /> : null}
                  <circle
                    cx={x}
                    cy={y}
                    r={sealed ? 4.2 : 3}
                    fill={vigil.completed ? color : "none"}
                    stroke={color}
                    strokeWidth={vigil.completed ? 0.8 : 1.1}
                    strokeDasharray={vigil.completed ? undefined : "2 2"}
                    opacity={vigil.sample ? 0.65 : 1}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {selected ? (
          <div className="constellation__detail">
            <div>
              <div className="meta-chips">
                <span className="tag">{relativeDay(selected.startedAt)}</span>
                <span className="tag">{formatDuration(selected.plannedMin)}</span>
                <span className={`tag ${selected.attestation ? "tag--ember" : ""}`}>
                  {selected.attestation ? "sealed" : selected.completed ? "unsigned" : "released"}
                </span>
                {selected.sample ? <span className="tag tag--muted">sample</span> : null}
                {!verifySeal(selected) ? <span className="tag tag--bad">altered</span> : null}
              </div>
              <h3>{selected.intention || "An unnamed vigil"}</h3>
              <p className="constellation__transmission">{selected.transmission}</p>
              <p className="hint">
                {formatDateTime(selected.startedAt)} · {formatMinutesShort(Math.round(selected.focusedSec / 60))}{" "}
                focused · seal {shortHash(selected.seal, 10, 8)}
              </p>
            </div>
            <div className="constellation__actions">
              <button className="btn btn--primary" type="button" onClick={() => openReturn(selected.id)}>
                {selected.attestation ? "Open the return" : "View & seal"}
              </button>
              <button
                className="btn btn--quiet"
                type="button"
                onClick={async () => {
                  const copied = await copyText(selected.transmission);
                  toast(copied ? "Transmission copied." : "The clipboard refused.", copied ? "success" : "error");
                }}
              >
                Copy transmission
              </button>
              <button className="btn btn--quiet" type="button" onClick={() => void removeSelected()}>
                Remove
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="crypt__columns">
        <section className="surface ledger" aria-label="Vigil ledger">
          <div className="panel-head">
            <div>
              <p className="kicker">Ledger</p>
              <h2>The record</h2>
            </div>
            <button
              className="text-link"
              type="button"
              onClick={() => {
                const added = vault.seedSamples();
                toast(
                  added > 0
                    ? `${added} remembered ${added === 1 ? "vigil" : "vigils"} joined.`
                    : "The remembered vigils are already here.",
                  "info",
                );
              }}
            >
              Add samples
            </button>
          </div>
          <ol className="ledger__list">
            {(showAll ? vigils : vigils.slice(0, 8)).map((vigil) => (
              <li key={vigil.id}>
                <button
                  type="button"
                  className={`ledger__row ${selected?.id === vigil.id ? "is-active" : ""}`}
                  onClick={() => setSelectedId(vigil.id)}
                >
                  <span className="ledger__date">{formatDate(vigil.startedAt)}</span>
                  <span className="ledger__intention">{vigil.intention || "Unnamed vigil"}</span>
                  <span className="ledger__minutes">{formatMinutesShort(vigil.plannedMin)}</span>
                  <span
                    className={`ledger__status ${
                      vigil.attestation ? "is-sealed" : vigil.completed ? "is-open" : "is-released"
                    }`}
                  >
                    {vigil.attestation ? "sealed" : vigil.completed ? "unsigned" : "released"}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {vigils.length > 8 ? (
            <button className="text-link ledger__more" type="button" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show less" : `Show all ${vigils.length}`}
            </button>
          ) : null}
        </section>

        <section className="surface archive" aria-label="Transmission archive">
          <div className="panel-head">
            <div>
              <p className="kicker">Transmissions</p>
              <h2>Words that stayed</h2>
            </div>
          </div>
          <div className="archive__list">
            {vigils
              .filter((vigil) => vigil.transmission)
              .slice(0, 8)
              .map((vigil) => (
                <details key={vigil.id} className="archive__item">
                  <summary>
                    <span>{vigil.intention || "An unnamed vigil"}</span>
                    <span className="archive__date">{relativeDay(vigil.startedAt)}</span>
                  </summary>
                  <p>{vigil.transmission}</p>
                </details>
              ))}
          </div>
        </section>
      </div>

      <div className="crypt__footer">
        <p className="hint">
          Archives live in this browser. Export them before clearing site data, or move them to
          another device.
        </p>
        <button className="text-link" type="button" onClick={() => navigate("/settings")}>
          Manage data in settings <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
