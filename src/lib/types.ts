export const CHANNEL_IDS = ["wind", "rain", "fire", "drone", "bells"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];
export type Levels = Record<ChannelId, number>;

export const CHANNELS: ReadonlyArray<{ id: ChannelId; label: string; hint: string }> = [
  { id: "wind", label: "Wind", hint: "A draft through old rafters" },
  { id: "rain", label: "Rain", hint: "Weather against the glass" },
  { id: "fire", label: "Hearth", hint: "Crackle and low warmth" },
  { id: "drone", label: "Drone", hint: "A held, distant note" },
  { id: "bells", label: "Bells", hint: "Far-off, irregular bells" },
];

export type AmbienceId = "hollow" | "downpour" | "hearth" | "chapel" | "still";

export interface AmbiencePreset {
  id: AmbienceId;
  name: string;
  tagline: string;
  levels: Levels;
}

export const AMBIENCES: ReadonlyArray<AmbiencePreset> = [
  {
    id: "hollow",
    name: "The Hollow",
    tagline: "Wind, a low drone, and distant bells.",
    levels: { wind: 0.55, rain: 0.1, fire: 0.16, drone: 0.42, bells: 0.14 },
  },
  {
    id: "downpour",
    name: "Drowned Chapel",
    tagline: "Steady rain against stained glass.",
    levels: { wind: 0.38, rain: 0.78, fire: 0.04, drone: 0.24, bells: 0.08 },
  },
  {
    id: "hearth",
    name: "The Hearth",
    tagline: "A fire that refuses to go out.",
    levels: { wind: 0.08, rain: 0, fire: 0.82, drone: 0.28, bells: 0 },
  },
  {
    id: "chapel",
    name: "Vigil Chapel",
    tagline: "A held note and the occasional bell.",
    levels: { wind: 0.12, rain: 0, fire: 0.08, drone: 0.58, bells: 0.44 },
  },
  {
    id: "still",
    name: "Still Air",
    tagline: "No sound but the room you are in.",
    levels: { wind: 0, rain: 0, fire: 0, drone: 0, bells: 0 },
  },
];

export function emptyLevels(): Levels {
  return { wind: 0, rain: 0, fire: 0, drone: 0, bells: 0 };
}

export function levelsFor(id: AmbienceId): Levels {
  const preset = AMBIENCES.find((item) => item.id === id) ?? AMBIENCES[0];
  return { ...preset.levels };
}

export function getAmbience(id: string | undefined): AmbiencePreset {
  return AMBIENCES.find((item) => item.id === id) ?? AMBIENCES[0];
}

export type WalletKind = "injected" | "local";

export interface StoredAttestation {
  address: `0x${string}`;
  chainId: number;
  kind: WalletKind;
  signature: `0x${string}`;
  signedAt: number;
  domain: {
    name: "Vesper";
    version: "1";
    chainId: number;
    verifyingContract?: `0x${string}`;
  };
  message: {
    id: `0x${string}`;
    keeper: `0x${string}`;
    startedAt: string;
    durationMin: number;
    seal: `0x${string}`;
  };
}

export interface SolanaAttestationV2 {
  v: 2;
  app: "vesper";
  chain: "solana";
  cluster: string;
  program: string | null;
  message: string;
  seal: string;
  record: { endedAt: string; intention: string; ambience: AmbienceId };
  signature: string;
  keeper: string;
}

export interface SolanaRecord {
  sigil: string;
  attestation: SolanaAttestationV2;
  onchain?: { cluster: string; program: string; mint: string; tx: string };
}

export interface Vigil {
  id: string;
  startedAt: number;
  endedAt: number;
  plannedMin: number;
  focusedSec: number;
  completed: boolean;
  intention: string;
  ambience: AmbienceId;
  levels: Levels;
  seal: `0x${string}`;
  transmission: string;
  attestation?: StoredAttestation;
  sealV2?: string;
  clockDriftMs?: number;
  solana?: SolanaRecord;
  onchain?: {
    txHash: `0x${string}`;
    chainId: number;
    contract: `0x${string}`;
  };
  sample?: boolean;
}

export interface WalletRecord {
  kind: WalletKind;
  address: `0x${string}`;
  chainId: number;
  privateKey?: `0x${string}`;
}

export interface Settings {
  masterVolume: number;
  defaultAmbience: AmbienceId;
  levels: Levels;
  reduceMotion: boolean;
}

export interface Vault {
  version: 1;
  vigils: Vigil[];
  settings: Settings;
}

export interface TimerSnapshot {
  phase: "running" | "paused";
  plannedSec: number;
  remainingSec: number;
  targetEnd: number | null;
  startedAt: number;
  sessionId: string;
  intention: string;
  ambience: AmbienceId;
  levels: Levels;
}

export interface TimerResult {
  sessionId: string;
  plannedSec: number;
  focusedSec: number;
  startedAt: number;
  endedAt: number;
  completed: boolean;
  intention: string;
  ambience: AmbienceId;
  levels: Levels;
  clockDriftMs: number | null;
}
