import { Candle } from "../components/Candle";
import { Sigil } from "../components/Sigil";
import { SITE } from "../lib/site";
import { formatDuration } from "../lib/time";
import { useApp } from "../state/AppContext";

export function LandingView() {
  const { navigate, stats, vault } = useApp();
  const hasVigils = vault.vault.vigils.length > 0;

  return (
    <div className="landing">
      <section className="hero page">
        <div className="hero__copy">
          <p className="kicker">A haunted focus ritual · Kiroween Costume Contest</p>
          <h1 className="hero__title">
            Keep a vigil.
            <br />
            <em>Leave a sigil.</em>
          </h1>
          <p className="hero__lede">
            Vesper turns deep work into a small, strange ceremony. Name what matters, light the
            candle, and let a live room of wind, rain and distant bells keep time. When the hour is
            kept, something returns with it — a transmission, a sigil, and a proof you can verify.
          </p>
          <div className="button-row">
            <button className="btn btn--primary" type="button" onClick={() => navigate("/vigil")}>
              Begin a vigil
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => navigate("/crypt")}>
              Enter the crypt
            </button>
          </div>
          <ul className="hero__meta">
            <li>5–45 minutes, or your own</li>
            <li>Procedural ambience</li>
            <li>EIP-712 verifiable</li>
          </ul>
        </div>

        <div className="altar" aria-label="An altar with a candle and a Vesper sigil">
          <div className="altar__rings">
            <Sigil seed="vesper-genesis" size={440} title="The first sigil of Vesper" />
          </div>
          <Candle className="altar__candle" />
          <span className="altar__tag altar__tag--a">
            <span className="dot dot--ember" /> seal · EIP-712
          </span>
          <span className="altar__tag altar__tag--b">
            <span className="dot dot--bone" /> 25:00 · kept
          </span>
          <span className="altar__tag altar__tag--c">
            <span className="dot dot--moss" /> {hasVigils ? `${stats.currentStreak}-day streak` : "no vigils yet"}
          </span>
          <p className="altar__caption">The sigil is drawn from the seal. No two are the same.</p>
        </div>
      </section>

      <section className="page section">
        <div className="section__head">
          <p className="kicker">The ritual</p>
          <h2>Three small acts of attention.</h2>
          <p className="lede">
            No feeds, no leaderboards, no productivity theatre. A timer, a room, and a record that
            stays in your hands.
          </p>
        </div>
        <ol className="steps">
          <li className="step surface">
            <span className="step__number">I</span>
            <h3>Name the work</h3>
            <p>
              One sentence, kept private. The house repeats it once in the transmission that follows.
            </p>
          </li>
          <li className="step surface">
            <span className="step__number">II</span>
            <h3>Keep the vigil</h3>
            <p>
              A candle burns down while the room breathes around you. Pause if you must; the timer
              remembers.
            </p>
          </li>
          <li className="step surface">
            <span className="step__number">III</span>
            <h3>Leave a sigil</h3>
            <p>
              A deterministic sigil and a short transmission return with you. Seal the record with a
              wallet signature, or keep it unsigned.
            </p>
          </li>
        </ol>
      </section>

      <section className="page section proof">
        <div className="proof__copy">
          <p className="kicker">Proof of focus</p>
          <h2>A record you can check without trusting us.</h2>
          <p className="lede">
            Vesper never uploads your intentions, your archive or your keys. Sealing a vigil signs a
            typed message using{" "}
            <abbr title="Ethereum Improvement Proposal 712">EIP-712</abbr>. The app recovers the
            signer locally and shows you the result.
          </p>
          <ul className="check-list">
            <li>Local keeper, generated in your browser — no wallet required to start.</li>
            <li>Browser wallet support through EIP-1193, with explicit chain checks.</li>
            <li>A soulbound ERC-721 registry ships in the repository for optional on-chain records.</li>
            <li>Export the archive or a single attestation at any time.</li>
          </ul>
          <a className="text-link" href={`${SITE.repoUrl}#readme`} target="_blank" rel="noreferrer">
            Read the design notes <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="proof__artifact surface">
          <p className="proof__artifact-head">attestation.json</p>
          <pre>
{`{
  "domain": {
    "name": "Vesper",
    "version": "1",
    "chainId": 8453
  },
  "message": {
    "id": "0x5c2f…9b1e",
    "keeper": "0x8A3d…F4c2",
    "startedAt": "1763516640000",
    "durationMin": 25,
    "seal": "0x9e71…0acd"
  },
  "signature": "0x4b1c…8f02"
}`}
          </pre>
          <p className="proof__artifact-foot">
            <span className="dot dot--moss" /> verified locally · nothing leaves the room
          </p>
        </div>
      </section>

      <section className="page section closing">
        <div className="closing__panel surface">
          <div>
            <p className="kicker">The crypt is listening</p>
            <h2>Your attention leaves a trace.</h2>
            <p className="lede">
              {hasVigils
                ? `${formatDuration(stats.totalMinutes)} kept across ${stats.completed} ${stats.completed === 1 ? "vigil" : "vigils"}. The constellation is still growing.`
                : "The first sigil is the hardest. After that, the house remembers you."}
            </p>
          </div>
          <div className="button-row">
            <button className="btn btn--primary" type="button" onClick={() => navigate("/vigil")}>
              Light the candle
            </button>
            <a className="btn btn--ghost" href={SITE.kiroweenUrl} target="_blank" rel="noreferrer">
              About Kiroween
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
