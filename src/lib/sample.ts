import { buildSeal } from "./attestation";
import { composeTransmission } from "./transmissions";
import { levelsFor, type AmbienceId, type Vigil } from "./types";

interface SampleSeed {
  daysAgo: number;
  minutes: number;
  intention: string;
  ambience: AmbienceId;
}

const SEEDS: SampleSeed[] = [
  { daysAgo: 0, minutes: 25, intention: "Finish the opening chapter", ambience: "hearth" },
  { daysAgo: 1, minutes: 45, intention: "Ship the quiet release", ambience: "chapel" },
  { daysAgo: 2, minutes: 25, intention: "Answer the letter I keep avoiding", ambience: "downpour" },
  { daysAgo: 3, minutes: 15, intention: "Sketch the north wall", ambience: "hollow" },
  { daysAgo: 4, minutes: 15, intention: "Sit with the problem, no tabs", ambience: "still" },
  { daysAgo: 5, minutes: 45, intention: "Rebuild the index by hand", ambience: "hearth" },
  { daysAgo: 6, minutes: 25, intention: "Read the contract twice", ambience: "chapel" },
  { daysAgo: 8, minutes: 15, intention: "Untangle the invoices", ambience: "downpour" },
  { daysAgo: 9, minutes: 25, intention: "Outline the second act", ambience: "hollow" },
  { daysAgo: 11, minutes: 45, intention: "Practice the difficult call", ambience: "still" },
  { daysAgo: 13, minutes: 25, intention: "Repair the broken paragraph", ambience: "hearth" },
  { daysAgo: 16, minutes: 15, intention: "Study the old map", ambience: "chapel" },
  { daysAgo: 18, minutes: 45, intention: "Close the loop with the studio", ambience: "hollow" },
];

function sampleStart(daysAgo: number, minutes: number, now: number): number {
  if (daysAgo === 0) return Math.max(now - minutes * 60_000, now - 4 * 3_600_000);
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(19 + (daysAgo % 3), (daysAgo * 7) % 60, 0, 0);
  return date.getTime();
}

export function buildSampleVigils(now = Date.now()): Vigil[] {
  return SEEDS.map((seed, index) => {
    const startedAt = sampleStart(seed.daysAgo, seed.minutes, now);
    const endedAt = startedAt + seed.minutes * 60_000;
    const base = {
      id: `sample-${String(index + 1).padStart(2, "0")}`,
      startedAt,
      endedAt,
      plannedMin: seed.minutes,
      focusedSec: seed.minutes * 60,
      completed: true,
      intention: seed.intention,
      ambience: seed.ambience,
      levels: levelsFor(seed.ambience),
    };
    const seal = buildSeal(base);
    return {
      ...base,
      seal,
      transmission: composeTransmission({
        id: base.id,
        seal,
        intention: base.intention,
        minutes: base.plannedMin,
        ambience: base.ambience,
        completed: true,
        startedAt: base.startedAt,
      }),
      sample: true as const,
    } satisfies Vigil;
  }).sort((a, b) => b.startedAt - a.startedAt);
}
