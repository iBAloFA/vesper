import { useEffect, useMemo, useState } from "react";
import { Candle } from "../components/Candle";
import { Sigil } from "../components/Sigil";
import {
  clampMinutes,
  CUSTOM_MINUTES_MAX,
  CUSTOM_MINUTES_MIN,
  PLAN_MINUTES,
  initialSetup,
} from "../lib/timer";
import { CHANNELS, getAmbience, levelsFor, type AmbienceId, type Levels } from "../lib/types";
import { formatClock, formatTime } from "../lib/time";
import { useApp } from "../state/AppContext";

export function VigilView() {
  const {
    timer,
    settings,
    beginVigil,
    releaseVigil,
    soundEnabled,
    startSound,
    stopSound,
    toast,
    confirm,
  } = useApp();

  const [presetMinutes, setPresetMinutes] = useState(25);
  const [customMinutes, setCustomMinutes] = useState(initialSetup(settings).customMinutes);
  const [customOpen, setCustomOpen] = useState(false);
  const [intention, setIntention] = useState("");
  const [ambience, setAmbience] = useState<AmbienceId>(settings.defaultAmbience);
  const [levels, setLevels] = useState<Levels>({ ...settings.levels });

  const minutes = customOpen ? clampMinutes(customMinutes) : presetMinutes;
  const activeMinutes = timer.snapshot ? Math.round(timer.snapshot.plannedSec / 60) : minutes;
  const previewSeed = useMemo(
    () => `${intention.trim() || "an unnamed vigil"}:${minutes}`,
    [intention, minutes],
  );

  useEffect(() => {
    if (!timer.snapshot) return;
    const previous = document.title;
    document.title = `${formatClock(timer.remaining)} — Vesper`;
    return () => {
      document.title = previous;
    };
  }, [timer.remaining, timer.snapshot]);

  if (timer.snapshot) {
    const paused = timer.snapshot.phase === "paused";
    const ambienceName = getAmbience(timer.snapshot.ambience).name;
    const minutesLeft = Math.ceil(timer.remaining / 60);
    const minutesLabel = `${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"}`;
    return (
      <div className={`ritual ${paused ? "is-paused" : "is-running"}`}>
        <div className="ritual__inner">
          <div className="ritual__sky" aria-hidden="true" />
          <p className="kicker">The vigil is {paused ? "held" : "burning"}</p>
          <Candle lit={!paused} className="ritual__candle" />
          <p className="ritual__intention">{timer.snapshot.intention || "An unnamed vigil"}</p>
          <p
            className="ritual__clock"
            role="timer"
            aria-label={`${minutesLabel} remaining`}
          >
            {formatClock(timer.remaining)}
          </p>
          <p className="ritual__meta">
            {activeMinutes}-minute vigil · {ambienceName} · began at{" "}
            {formatTime(timer.snapshot.startedAt)}
          </p>
          <p className="sr-only" aria-live="polite">
            {paused ? "The vigil is paused." : `${minutesLabel} remaining.`}
          </p>

          <div className="ritual__controls">
            {paused ? (
              <button className="btn btn--primary" type="button" onClick={timer.resume}>
                Resume the vigil
              </button>
            ) : (
              <button className="btn btn--ghost" type="button" onClick={timer.pause}>
                Hold the flame
              </button>
            )}
            {!soundEnabled ? (
              <button
                className="btn btn--quiet"
                type="button"
                onClick={() => void startSound(timer.snapshot?.levels)}
              >
                Wake the room
              </button>
            ) : null}
            <button
              className="btn btn--quiet ritual__release"
              type="button"
              onClick={async () => {
                const confirmed = await confirm({
                  title: "Break the vigil?",
                  body: "The candle will go out early and the sigil will remain unfinished. The attempt is still recorded.",
                  confirmLabel: "Release it",
                  cancelLabel: "Keep going",
                  danger: true,
                });
                if (confirmed) releaseVigil();
              }}
            >
              Break the vigil
            </button>
          </div>
          <p className="ritual__hint">
            {paused
              ? "The room waits. Nothing is lost while the flame is held."
              : "Stay with one thing. The room will tell you when it is done."}
          </p>
        </div>
      </div>
    );
  }

  const setPreset = (value: number) => {
    setPresetMinutes(value);
    setCustomOpen(false);
  };

  const chooseAmbience = (id: AmbienceId) => {
    setAmbience(id);
    setLevels(levelsFor(id));
  };

  const setChannel = (id: keyof Levels, value: number) => {
    setLevels((current) => ({ ...current, [id]: Math.min(1, Math.max(0, value / 100)) }));
  };

  return (
    <div className="page setup">
      <header className="page-head">
        <p className="kicker">The vigil</p>
        <h1>What will you keep?</h1>
        <p className="lede">
          One intention, one room, one candle. The sigil does not exist until you finish — but you can
          already see it forming.
        </p>
      </header>

      <div className="setup__grid">
        <form
          className="surface setup__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!Number.isFinite(customMinutes) && customOpen) {
              toast("Choose a length between 1 and 180 minutes.", "error");
              return;
            }
            beginVigil({
              intention,
              minutes,
              customMinutes: clampMinutes(customMinutes),
              ambience,
              levels,
            });
          }}
        >
          <div className="field">
            <div className="field__label-row">
              <label htmlFor="intention">Name the thing</label>
              <span className="field__count">{intention.length}/80</span>
            </div>
            <textarea
              id="intention"
              className="input input--area"
              rows={3}
              maxLength={80}
              value={intention}
              placeholder="Finish the opening chapter. Answer the letter. Sit with the hard problem."
              onChange={(event) => setIntention(event.target.value)}
              aria-describedby="intention-hint"
            />
            <p id="intention-hint" className="hint">
              It stays in this browser. The transmission will repeat it once.
            </p>
          </div>

          <fieldset className="field">
            <legend>How long?</legend>
            <div className="chips" role="group" aria-label="Vigil length">
              {PLAN_MINUTES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${!customOpen && presetMinutes === value ? "is-active" : ""}`}
                  aria-pressed={!customOpen && presetMinutes === value}
                  onClick={() => setPreset(value)}
                >
                  {value} min
                </button>
              ))}
              <button
                type="button"
                className={`chip ${customOpen ? "is-active" : ""}`}
                aria-pressed={customOpen}
                onClick={() => setCustomOpen(true)}
              >
                Custom
              </button>
            </div>
            {customOpen ? (
              <div className="custom-length">
                <label htmlFor="custom-minutes">Minutes</label>
                <input
                  id="custom-minutes"
                  className="input input--number"
                  type="number"
                  min={CUSTOM_MINUTES_MIN}
                  max={CUSTOM_MINUTES_MAX}
                  value={Number.isFinite(customMinutes) ? customMinutes : ""}
                  onChange={(event) => setCustomMinutes(Number.parseInt(event.target.value, 10))}
                  onBlur={() => setCustomMinutes(clampMinutes(customMinutes))}
                />
                <span className="hint">
                  Up to {CUSTOM_MINUTES_MAX} minutes. The candle does not judge.
                </span>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="field">
            <legend>The room</legend>
            <div className="ambience-grid" role="group" aria-label="Ambience preset">
              {(["hollow", "downpour", "hearth", "chapel", "still"] as AmbienceId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`ambience ${ambience === id ? "is-active" : ""}`}
                  aria-pressed={ambience === id}
                  onClick={() => chooseAmbience(id)}
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
                    <span className="slider__value">{Math.round(levels[channel.id] * 100)}</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(levels[channel.id] * 100)}
                    onChange={(event) => setChannel(channel.id, Number(event.target.value))}
                    aria-label={`${channel.label} level`}
                  />
                  <span className="slider__hint">{channel.hint}</span>
                </label>
              ))}
            </div>
            <div className="mixer__actions">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  if (soundEnabled) stopSound();
                  else void startSound(levels);
                }}
              >
                {soundEnabled ? "Silence the room" : "Hear this room"}
              </button>
              <span className="hint">Audio begins with a gesture, never by surprise.</span>
            </div>
          </fieldset>

          <button className="btn btn--primary btn--wide" type="submit">
            Light the candle · {minutes} min
          </button>
          <p className="hint setup__fineprint">
            Navigating away will not stop a vigil already in progress. Sound may be adjusted during
            the ritual from the room controls.
          </p>
        </form>

        <aside className="setup__aside">
          <div className="surface setup__altar">
            <div className="setup__sigil-wrap">
              <Sigil seed={previewSeed} size={280} title="A sigil forming" />
              <Candle small className="setup__candle" />
            </div>
            <p className="kicker">Still forming</p>
            <p className="setup__altar-copy">
              The final sigil is drawn from the vigil's seal — your intention, the length, and the
              exact moment you began. This is only a draft.
            </p>
          </div>
          <div className="surface setup__notes">
            <p className="kicker">Before you begin</p>
            <ul className="check-list">
              <li>Close what can wait. The room will hold the rest.</li>
              <li>Keep this tab open; the vigil survives a reload.</li>
              <li>You may pause, but breaking the vigil releases it unfinished.</li>
              <li>Headphones make the bells feel farther away.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
