import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersistedTimer,
  clearVaultStorage,
  clearWalletStorage,
  defaultSettings,
  defaultVault,
  loadPersistedTimer,
  loadVault,
  loadWallet,
  parseVaultImport,
  savePersistedTimer,
  saveVault,
  saveWallet,
  serializeVault,
} from "../src/lib/storage";
import type { TimerSnapshot, WalletRecord } from "../src/lib/types";
import { makeAttestation, makeVigil, SIGNATURE } from "./fixtures";

const VAULT_KEY = "vesper.vault.v1";
const TIMER_KEY = "vesper.timer.v1";
const WALLET_KEY = "vesper.wallet.v1";

class MemoryStorage {
  readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage: storage });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("vault defaults", () => {
  it("returns an empty v1 vault with the default room", () => {
    const vault = loadVault();
    expect(vault).toEqual(defaultVault());
    expect(vault.settings).toEqual(defaultSettings());
    expect(vault.vigils).toEqual([]);
  });
});

describe("loadVault sanitisation", () => {
  it("keeps valid vigils and drops malformed ones", () => {
    const valid = {
      ...makeVigil(),
      intention: "i".repeat(120),
      transmission: "t".repeat(900),
      attestation: makeAttestation(),
    };
    const badSeal = { ...makeVigil({ id: "bad-seal" }), seal: "0x1234" };
    const noId = { ...makeVigil(), id: "" };
    const noStart = { ...makeVigil({ id: "no-start" }), startedAt: 0 };
    storage.setItem(
      VAULT_KEY,
      JSON.stringify({
        version: 1,
        vigils: [valid, badSeal, noId, noStart, null, "nope"],
        settings: { masterVolume: 9, defaultAmbience: "nope", reduceMotion: true, levels: { wind: 5, rain: -2, bells: "x" } },
      }),
    );

    const vault = loadVault();
    expect(vault.vigils).toHaveLength(1);
    const vigil = vault.vigils[0]!;
    expect(vigil.id).toBe("vigil-1");
    expect(vigil.intention).toHaveLength(80);
    expect(vigil.transmission).toHaveLength(600);
    expect(vigil.attestation?.signature).toBe(SIGNATURE);
    expect(vault.settings.masterVolume).toBe(1);
    expect(vault.settings.defaultAmbience).toBe("hollow");
    expect(vault.settings.reduceMotion).toBe(true);
    expect(vault.settings.levels).toEqual({ wind: 1, rain: 0, fire: 0, drone: 0, bells: 0 });
  });

  it("clamps vigil ranges and derives focused time for completed records", () => {
    storage.setItem(
      VAULT_KEY,
      JSON.stringify({
        vigils: [
          makeVigil({ plannedMin: 9999, focusedSec: -5, endedAt: 0, completed: true }),
          makeVigil({ id: "released", completed: false, focusedSec: 99999, plannedMin: 10 }),
        ],
      }),
    );
    const [completed, released] = loadVault().vigils;
    expect(completed!.plannedMin).toBe(600);
    expect(completed!.focusedSec).toBe(36000);
    expect(completed!.endedAt).toBe(completed!.startedAt);
    expect(released!.focusedSec).toBe(600);
  });

  it("drops invalid attestations instead of the whole vigil", () => {
    storage.setItem(
      VAULT_KEY,
      JSON.stringify({
        vigils: [{ ...makeVigil(), attestation: { ...makeAttestation(), signature: "0xdead" } }],
      }),
    );
    const vigil = loadVault().vigils[0]!;
    expect(vigil.id).toBe("vigil-1");
    expect(vigil.attestation).toBeUndefined();
  });

  it("backs up a corrupt vault and starts clean", () => {
    storage.setItem(VAULT_KEY, "{not json");
    const vault = loadVault();
    expect(vault.vigils).toEqual([]);
    expect(storage.getItem(VAULT_KEY)).toBeNull();
    expect(storage.keys().some((key) => key.startsWith(`${VAULT_KEY}.corrupt.`))).toBe(true);
  });

  it("treats a non-array vigil list as corrupt", () => {
    storage.setItem(VAULT_KEY, JSON.stringify({ version: 1, vigils: {} }));
    expect(loadVault().vigils).toEqual([]);
    expect(storage.keys().some((key) => key.startsWith(`${VAULT_KEY}.corrupt.`))).toBe(true);
  });
});

describe("save and export", () => {
  it("round-trips through storage", () => {
    const vault = defaultVault();
    const vigil = makeVigil();
    vault.vigils.push(vigil);
    saveVault(vault);
    expect(loadVault().vigils[0]!.id).toBe(vigil.id);
  });

  it("serialises a versioned archive", () => {
    const vault = defaultVault();
    vault.vigils.push(makeVigil());
    const payload = JSON.parse(serializeVault(vault));
    expect(payload.app).toBe("vesper");
    expect(payload.version).toBe(1);
    expect(payload.vigils).toHaveLength(1);
    expect(typeof payload.exportedAt).toBe("string");
  });

  it("clears the vault", () => {
    saveVault(defaultVault());
    clearVaultStorage();
    expect(storage.getItem(VAULT_KEY)).toBeNull();
  });
});

describe("parseVaultImport", () => {
  it("accepts a valid archive and sanitises settings", () => {
    const text = JSON.stringify({
      app: "vesper",
      version: 1,
      vigils: [makeVigil()],
      settings: { masterVolume: 4, defaultAmbience: "chapel" },
    });
    const vault = parseVaultImport(text);
    expect(vault.vigils).toHaveLength(1);
    expect(vault.settings.masterVolume).toBe(1);
    expect(vault.settings.defaultAmbience).toBe("chapel");
  });

  it("rejects invalid input with specific errors", () => {
    expect(() => parseVaultImport("{")).toThrow("not valid JSON");
    expect(() => parseVaultImport("null")).toThrow("does not look like a Vesper archive");
    expect(() => parseVaultImport(JSON.stringify({ app: "other", vigils: [] }))).toThrow("different app");
    expect(() => parseVaultImport(JSON.stringify({ app: "vesper" }))).toThrow("no vigil list");
    expect(() =>
      parseVaultImport(JSON.stringify({ app: "vesper", vigils: [{ id: "bad" }] })),
    ).toThrow("no readable vigils");
  });
});

describe("timer persistence", () => {
  const snapshot: TimerSnapshot = {
    phase: "running",
    plannedSec: 1500,
    remainingSec: 1500,
    targetEnd: Date.now() + 1500_000,
    startedAt: Date.now(),
    sessionId: "session-1",
    intention: "Finish",
    ambience: "hollow",
    levels: { wind: 0.5, rain: 0, fire: 0, drone: 0, bells: 0 },
  };

  it("round-trips a running snapshot", () => {
    savePersistedTimer(snapshot);
    expect(loadPersistedTimer()).toEqual(snapshot);
  });

  it("round-trips a paused snapshot without a target", () => {
    const paused = { ...snapshot, phase: "paused" as const, targetEnd: null, remainingSec: 600 };
    savePersistedTimer(paused);
    expect(loadPersistedTimer()).toEqual(paused);
  });

  it("clamps remaining seconds and rejects unusable snapshots", () => {
    savePersistedTimer({ ...snapshot, remainingSec: 99_999 });
    expect(loadPersistedTimer()?.remainingSec).toBe(1500);

    for (const invalid of [
      { ...snapshot, phase: "done" },
      { ...snapshot, plannedSec: 0 },
      { ...snapshot, targetEnd: null },
      { ...snapshot, startedAt: 0 },
      { ...snapshot, sessionId: "" },
    ]) {
      storage.setItem(TIMER_KEY, JSON.stringify(invalid));
      expect(loadPersistedTimer()).toBeNull();
    }
  });

  it("returns null for corrupt timer JSON and clears cleanly", () => {
    storage.setItem(TIMER_KEY, "nope");
    expect(loadPersistedTimer()).toBeNull();
    savePersistedTimer(snapshot);
    clearPersistedTimer();
    expect(storage.getItem(TIMER_KEY)).toBeNull();
  });
});

describe("wallet persistence", () => {
  const injected: WalletRecord = {
    kind: "injected",
    address: "0x4444444444444444444444444444444444444444",
    chainId: 8453,
  };
  const local: WalletRecord = {
    ...injected,
    kind: "local",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  };

  it("round-trips injected and local records", () => {
    saveWallet(injected);
    expect(loadWallet()).toEqual(injected);
    saveWallet(local);
    expect(loadWallet()).toEqual(local);
  });

  it("rejects local records without a key and unknown chains", () => {
    storage.setItem(WALLET_KEY, JSON.stringify({ ...local, privateKey: undefined }));
    expect(loadWallet()).toBeNull();
    storage.setItem(WALLET_KEY, JSON.stringify({ ...injected, chainId: 0 }));
    expect(loadWallet()).toBeNull();
    storage.setItem(WALLET_KEY, JSON.stringify({ ...injected, address: "nope" }));
    expect(loadWallet()).toBeNull();
  });

  it("clears the wallet", () => {
    saveWallet(injected);
    clearWalletStorage();
    expect(storage.getItem(WALLET_KEY)).toBeNull();
  });
});
