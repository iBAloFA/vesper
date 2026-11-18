import {
  AMBIENCES,
  CHANNEL_IDS,
  emptyLevels,
  levelsFor,
  type AmbienceId,
  type Levels,
  type Settings,
  type SolanaAttestationV2,
  type SolanaRecord,
  type StoredAttestation,
  type TimerSnapshot,
  type Vault,
  type Vigil,
  type WalletRecord,
} from "./types";

const VAULT_KEY = "vesper.vault.v1";
const TIMER_KEY = "vesper.timer.v1";
const WALLET_KEY = "vesper.wallet.v1";
const MAX_VIGILS = 5000;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX32_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_PATTERN = /^0x[0-9a-fA-F]{130}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE58_PUBLIC_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const MESSAGE_PREFIX = "vesper.vigil.v2\n";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeGet(key: string): string | null {
  if (!hasWindow()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error("Vesper could not write to local storage.", error);
  }
}

function safeRemove(key: string): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeLevels(value: unknown): Levels {
  const record = asRecord(value);
  if (!record) return emptyLevels();
  const levels = emptyLevels();
  for (const channel of CHANNEL_IDS) {
    const raw = record[channel];
    levels[channel] = typeof raw === "number" && Number.isFinite(raw) ? clamp(raw, 0, 1) : 0;
  }
  return levels;
}

function asAmbience(value: unknown): AmbienceId {
  return AMBIENCES.some((preset) => preset.id === value) ? (value as AmbienceId) : "hollow";
}

function sanitizeAttestation(value: unknown): StoredAttestation | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const domain = asRecord(record.domain);
  const message = asRecord(record.message);
  if (!domain || !message) return undefined;
  const address = record.address;
  const signature = record.signature;
  const keeper = message.keeper;
  const id = message.id;
  const seal = message.seal;
  if (typeof address !== "string" || !ADDRESS_PATTERN.test(address)) return undefined;
  if (typeof signature !== "string" || !SIGNATURE_PATTERN.test(signature)) return undefined;
  if (typeof keeper !== "string" || !ADDRESS_PATTERN.test(keeper)) return undefined;
  if (typeof id !== "string" || !HEX32_PATTERN.test(id)) return undefined;
  if (typeof seal !== "string" || !HEX32_PATTERN.test(seal)) return undefined;
  if (domain.name !== "Vesper" || domain.version !== "1") return undefined;
  const chainId = asFiniteNumber(record.chainId, 0);
  if (!Number.isInteger(chainId) || chainId < 1) return undefined;
  const domainChainId = asFiniteNumber(domain.chainId, 0);
  if (!Number.isInteger(domainChainId) || domainChainId < 1) return undefined;
  const startedAt = typeof message.startedAt === "string" ? message.startedAt : "";
  if (!/^\d+$/.test(startedAt)) return undefined;
  const durationMin = asFiniteNumber(message.durationMin, 0);
  if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 600) return undefined;
  const kind = record.kind === "local" ? "local" : record.kind === "injected" ? "injected" : null;
  if (!kind) return undefined;
  const verifyingContract =
    typeof domain.verifyingContract === "string" && ADDRESS_PATTERN.test(domain.verifyingContract)
      ? (domain.verifyingContract as `0x${string}`)
      : undefined;
  return {
    address: address as `0x${string}`,
    chainId,
    kind,
    signature: signature as `0x${string}`,
    signedAt: asFiniteNumber(record.signedAt, 0),
    domain: {
      name: "Vesper",
      version: "1",
      chainId: domainChainId,
      ...(verifyingContract ? { verifyingContract } : {}),
    },
    message: {
      id: id as `0x${string}`,
      keeper: keeper as `0x${string}`,
      startedAt,
      durationMin,
      seal: seal as `0x${string}`,
    },
  };
}

function sanitizeSolanaAttestation(value: unknown): SolanaAttestationV2 | undefined {
  const record = asRecord(value);
  if (!record || record.v !== 2 || record.app !== "vesper" || record.chain !== "solana") {
    return undefined;
  }
  const cluster = record.cluster;
  if (typeof cluster !== "string" || cluster.length === 0 || cluster.length > 32) return undefined;
  const program =
    record.program === null || record.program === undefined
      ? null
      : typeof record.program === "string" && BASE58_PUBLIC_KEY.test(record.program)
        ? record.program
        : undefined;
  if (program === undefined) return undefined;
  const message = record.message;
  if (
    typeof message !== "string" ||
    !message.startsWith(MESSAGE_PREFIX) ||
    message.length > 2_000
  ) {
    return undefined;
  }
  const seal = record.seal;
  if (typeof seal !== "string" || !SHA256_PATTERN.test(seal)) return undefined;
  const keeper = record.keeper;
  if (typeof keeper !== "string" || !BASE58_PUBLIC_KEY.test(keeper)) return undefined;
  const signature = record.signature;
  if (typeof signature !== "string" || !BASE58_SIGNATURE.test(signature)) return undefined;
  const sealed = asRecord(record.record);
  if (!sealed) return undefined;
  const endedAt = sealed.endedAt;
  if (typeof endedAt !== "string" || !/^\d{1,20}$/.test(endedAt)) return undefined;
  const intention = sealed.intention;
  if (typeof intention !== "string" || intention.length > 80) return undefined;
  const ambience = AMBIENCES.some((preset) => preset.id === sealed.ambience)
    ? (sealed.ambience as AmbienceId)
    : null;
  if (!ambience) return undefined;
  return {
    v: 2,
    app: "vesper",
    chain: "solana",
    cluster,
    program,
    message,
    seal,
    record: { endedAt, intention, ambience },
    signature,
    keeper,
  };
}

function sanitizeSolana(value: unknown): SolanaRecord | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const sigil = record.sigil;
  if (typeof sigil !== "string" || !SHA256_PATTERN.test(sigil)) return undefined;
  const attestation = sanitizeSolanaAttestation(record.attestation);
  if (!attestation) return undefined;
  const onchain = asRecord(record.onchain);
  const cluster = onchain?.cluster;
  const program = onchain?.program;
  const mint = onchain?.mint;
  const tx = onchain?.tx;
  const sanitizedOnchain =
    typeof cluster === "string" &&
    cluster.length > 0 &&
    cluster.length <= 32 &&
    typeof program === "string" &&
    BASE58_PUBLIC_KEY.test(program) &&
    typeof mint === "string" &&
    BASE58_PUBLIC_KEY.test(mint) &&
    typeof tx === "string" &&
    BASE58_SIGNATURE.test(tx)
      ? { cluster, program, mint, tx }
      : undefined;
  return { sigil, attestation, ...(sanitizedOnchain ? { onchain: sanitizedOnchain } : {}) };
}

function sanitizeVigil(value: unknown): Vigil | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = record.id;
  if (typeof id !== "string" || id.length === 0 || id.length > 120) return null;
  const seal = record.seal;
  if (typeof seal !== "string" || !HEX32_PATTERN.test(seal)) return null;
  const startedAt = asFiniteNumber(record.startedAt, 0);
  if (startedAt <= 0) return null;
  const endedAt = Math.max(startedAt, asFiniteNumber(record.endedAt, startedAt));
  const plannedMin = clamp(Math.round(asFiniteNumber(record.plannedMin, 25)), 1, 600);
  const completed = Boolean(record.completed);
  let focusedSec = clamp(
    Math.round(asFiniteNumber(record.focusedSec, completed ? plannedMin * 60 : 0)),
    0,
    plannedMin * 60,
  );
  if (completed && focusedSec === 0) focusedSec = plannedMin * 60;
  const onchain = asRecord(record.onchain);
  const txHash = onchain?.txHash;
  const contract = onchain?.contract;
  const sanitizedOnchain =
    onchain &&
    typeof txHash === "string" &&
    HEX32_PATTERN.test(txHash) &&
    typeof contract === "string" &&
    ADDRESS_PATTERN.test(contract)
      ? {
          txHash: txHash as `0x${string}`,
          contract: contract as `0x${string}`,
          chainId: Math.round(asFiniteNumber(onchain.chainId, 0)),
        }
      : undefined;

  const solanaRecord = sanitizeSolana(record.solana);
  const sealV2 =
    typeof record.sealV2 === "string" && SHA256_PATTERN.test(record.sealV2)
      ? record.sealV2
      : undefined;
  const solana =
    solanaRecord && sealV2 && solanaRecord.attestation.seal !== sealV2 ? undefined : solanaRecord;
  const clockDriftMs =
    typeof record.clockDriftMs === "number" &&
    Number.isSafeInteger(record.clockDriftMs) &&
    record.clockDriftMs >= 0
      ? record.clockDriftMs
      : undefined;

  return {
    id,
    startedAt,
    endedAt,
    plannedMin,
    focusedSec,
    completed,
    intention: typeof record.intention === "string" ? record.intention.slice(0, 80) : "",
    ambience: asAmbience(record.ambience),
    levels: sanitizeLevels(record.levels),
    seal: seal as `0x${string}`,
    transmission: typeof record.transmission === "string" ? record.transmission.slice(0, 600) : "",
    ...(sanitizeAttestation(record.attestation)
      ? { attestation: sanitizeAttestation(record.attestation) }
      : {}),
    ...(sealV2 ? { sealV2 } : {}),
    ...(clockDriftMs !== undefined ? { clockDriftMs } : {}),
    ...(solana ? { solana } : {}),
    ...(sanitizedOnchain ? { onchain: sanitizedOnchain } : {}),
    ...(record.sample === true ? { sample: true } : {}),
  };
}

function sanitizeSettings(value: unknown): Settings {
  const record = asRecord(value);
  const ambience = asAmbience(record?.defaultAmbience);
  return {
    masterVolume: clamp(asFiniteNumber(record?.masterVolume, 0.7), 0, 1),
    defaultAmbience: ambience,
    levels: record?.levels ? sanitizeLevels(record.levels) : levelsFor(ambience),
    reduceMotion: record?.reduceMotion === true,
  };
}

export function defaultSettings(): Settings {
  return {
    masterVolume: 0.7,
    defaultAmbience: "hollow",
    levels: levelsFor("hollow"),
    reduceMotion: false,
  };
}

export function defaultVault(): Vault {
  return { version: 1, vigils: [], settings: defaultSettings() };
}

export function loadVault(): Vault {
  const raw = safeGet(VAULT_KEY);
  if (!raw) return defaultVault();
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = asRecord(parsed);
    if (!record || !Array.isArray(record.vigils)) throw new Error("Unexpected vault shape");
    const vigils = record.vigils
      .slice(0, MAX_VIGILS)
      .map(sanitizeVigil)
      .filter((vigil): vigil is Vigil => vigil !== null);
    return { version: 1, vigils, settings: sanitizeSettings(record.settings) };
  } catch (error) {
    console.error("Vesper found a damaged vault and kept a backup.", error);
    safeSet(`${VAULT_KEY}.corrupt.${Date.now()}`, raw);
    safeRemove(VAULT_KEY);
    return defaultVault();
  }
}

export function saveVault(vault: Vault): void {
  safeSet(VAULT_KEY, JSON.stringify(vault));
}

export function clearVaultStorage(): void {
  safeRemove(VAULT_KEY);
}

export interface VaultExport {
  app: "vesper";
  version: 1;
  exportedAt: string;
  vigils: Vigil[];
  settings: Settings;
}

export function serializeVault(vault: Vault): string {
  const payload: VaultExport = {
    app: "vesper",
    version: 1,
    exportedAt: new Date().toISOString(),
    vigils: vault.vigils,
    settings: vault.settings,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseVaultImport(text: string): Vault {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const record = asRecord(parsed);
  if (!record) throw new Error("That file does not look like a Vesper archive.");
  if (record.app !== undefined && record.app !== "vesper") {
    throw new Error("That archive belongs to a different app.");
  }
  if (!Array.isArray(record.vigils)) throw new Error("The archive has no vigil list.");
  if (record.vigils.length > MAX_VIGILS) throw new Error("That archive is too large.");
  const vigils = record.vigils
    .map(sanitizeVigil)
    .filter((vigil): vigil is Vigil => vigil !== null);
  if (record.vigils.length > 0 && vigils.length === 0) {
    throw new Error("The archive contains no readable vigils.");
  }
  return { version: 1, vigils, settings: sanitizeSettings(record.settings) };
}

export function loadPersistedTimer(): TimerSnapshot | null {
  const raw = safeGet(TIMER_KEY);
  if (!raw) return null;
  try {
    const record = asRecord(JSON.parse(raw));
    if (!record) return null;
    const phase = record.phase === "running" ? "running" : record.phase === "paused" ? "paused" : null;
    if (!phase) return null;
    const plannedSec = Math.round(asFiniteNumber(record.plannedSec, 0));
    if (plannedSec < 1 || plannedSec > 600 * 60) return null;
    const remainingSec = clamp(Math.round(asFiniteNumber(record.remainingSec, plannedSec)), 0, plannedSec);
    const targetEnd =
      phase === "running" ? asFiniteNumber(record.targetEnd, 0) : null;
    if (phase === "running" && (!targetEnd || targetEnd <= 0)) return null;
    const startedAt = asFiniteNumber(record.startedAt, 0);
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
    if (!startedAt || !sessionId) return null;
    return {
      phase,
      plannedSec,
      remainingSec,
      targetEnd,
      startedAt,
      sessionId,
      intention: typeof record.intention === "string" ? record.intention.slice(0, 80) : "",
      ambience: asAmbience(record.ambience),
      levels: sanitizeLevels(record.levels),
    };
  } catch {
    return null;
  }
}

export function savePersistedTimer(snapshot: TimerSnapshot): void {
  safeSet(TIMER_KEY, JSON.stringify(snapshot));
}

export function clearPersistedTimer(): void {
  safeRemove(TIMER_KEY);
}

export function loadWallet(): WalletRecord | null {
  const raw = safeGet(WALLET_KEY);
  if (!raw) return null;
  try {
    const record = asRecord(JSON.parse(raw));
    if (!record) return null;
    const kind = record.kind === "local" ? "local" : record.kind === "injected" ? "injected" : null;
    const address = record.address;
    const chainId = asFiniteNumber(record.chainId, 0);
    if (!kind || typeof address !== "string" || !ADDRESS_PATTERN.test(address)) return null;
    if (!Number.isInteger(chainId) || chainId < 1) return null;
    if (kind === "local") {
      const privateKey = record.privateKey;
      if (typeof privateKey !== "string" || !HEX32_PATTERN.test(privateKey)) return null;
      return {
        kind,
        address: address as `0x${string}`,
        chainId,
        privateKey: privateKey as `0x${string}`,
      };
    }
    return { kind, address: address as `0x${string}`, chainId };
  } catch {
    return null;
  }
}

export function saveWallet(wallet: WalletRecord): void {
  safeSet(WALLET_KEY, JSON.stringify(wallet));
}

export function clearWalletStorage(): void {
  safeRemove(WALLET_KEY);
}
