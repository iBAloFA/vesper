import { createRng, hashString, pick, pickMany } from "./hash";
import { getAmbience, type AmbienceId } from "./types";

interface TransmissionInput {
  id: string;
  seal: string;
  intention: string;
  minutes: number;
  ambience: AmbienceId;
  completed: boolean;
  startedAt: number;
}

const OPENINGS = [
  "The candle leaned toward your words.",
  "A draft crossed the room, though every window was shut.",
  "The dark listened the way old houses do.",
  "For a moment, the clock forgot to tick.",
  "Something in the wall let out a slow breath.",
  "The flame stood very still, as if remembering.",
  "Outside, the night went quiet on purpose.",
  "The floorboards settled, and kept their counsel.",
  "A little ash lifted from the wick and did not fall.",
  "The house drew closer without moving at all.",
];

const COMPLETED_MIDDLES = [
  "You kept the vigil for {minutes}; the house kept count.",
  "The flame held for {minutes}, and that is its own kind of prayer.",
  "{minutes} passed without argument. Not every night is so generous.",
  "For {minutes}, nothing was owed to anyone but the work.",
  "The clock returned {minutes} to you, and you spent them in one piece.",
  "You stayed for {minutes}. The dark made a note of it.",
];

const RELEASED_MIDDLES = [
  "You took the flame early, but the dark remembers the attempt.",
  "The vigil ended before its time. The room does not hold it against you.",
  "You left the candle unfinished. Even half a prayer is heard.",
  "The wick was pinched out early, and the house kept the smoke.",
];

const INTENTION_LINES = [
  "You named it: “{intention}.” The walls repeated it once, softly.",
  "“{intention},” you said. The room wrote it down somewhere you cannot see.",
  "Your words left a mark: “{intention}.”",
  "The house took your sentence and filed it under things that matter: “{intention}.”",
];

const AMBIENCE_LINES: Record<AmbienceId, readonly string[]> = {
  hollow: [
    "Wind moved through the rafters, looking for a way out.",
    "The bells were far away, and answered no one.",
  ],
  downpour: [
    "Rain kept its steady hand on the glass.",
    "The weather stayed with you, sentence by sentence.",
  ],
  hearth: [
    "The fire cracked its knuckles and settled in.",
    "The hearth gave off more warmth than a fire should.",
  ],
  chapel: [
    "A held note hung in the air, waiting for you to finish it.",
    "The bell sounded once and declined to explain itself.",
  ],
  still: [
    "The air was still enough to hear the house think.",
    "No sound came, which is its own kind of company.",
  ],
};

const CLOSINGS = [
  "Keep what the flame kept.",
  "Leave the rest for morning.",
  "The sigil is yours now.",
  "Do not look for the house again tonight.",
  "What you finish in the dark still counts in the light.",
  "The wick remembers even when you do not.",
  "Go quietly. The house is listening.",
  "What was unfinished is still yours to finish.",
];

function spokenMinutes(minutes: number): string {
  const safe = Math.max(1, Math.round(minutes));
  if (safe === 1) return "one minute";
  if (safe === 60) return "an hour";
  if (safe === 90) return "ninety minutes";
  return `${safe} minutes`;
}

function trimIntention(intention: string): string {
  return intention.replace(/\s+/g, " ").trim().slice(0, 80);
}

export function composeTransmission(input: TransmissionInput): string {
  const rng = createRng(hashString(`${input.id}:${input.seal}:${input.startedAt}`));
  const opening = pick(rng, OPENINGS);
  const middles = input.completed ? COMPLETED_MIDDLES : RELEASED_MIDDLES;
  const middle = pick(rng, middles).replace("{minutes}", spokenMinutes(input.minutes));
  const ambience = pick(rng, AMBIENCE_LINES[input.ambience] ?? AMBIENCE_LINES.hollow);
  const intention = trimIntention(input.intention);
  const closing = pick(rng, CLOSINGS);

  const sentences = [opening, middle];
  if (intention) {
    const line = pick(rng, INTENTION_LINES).replace("{intention}", intention);
    sentences.push(line);
  }
  if (rng() > 0.4 || !intention) {
    sentences.push(ambience);
  }
  sentences.push(closing);

  const extras = pickMany(rng, sentences, Math.min(4, sentences.length));
  return extras.join(" ");
}

export function ambienceLabel(id: AmbienceId): string {
  return getAmbience(id).name;
}
