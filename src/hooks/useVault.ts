import { useCallback, useEffect, useState } from "react";
import { buildSampleVigils } from "../lib/sample";
import {
  clearVaultStorage,
  defaultSettings,
  defaultVault,
  loadVault,
  parseVaultImport,
  saveVault,
  serializeVault,
} from "../lib/storage";
import type { Settings, Vault, Vigil } from "../lib/types";

const VAULT_STORAGE_KEY = "vesper.vault.v1";

function sortVigils(vigils: Vigil[]): Vigil[] {
  return [...vigils].sort((a, b) => b.startedAt - a.startedAt);
}

export type ImportMode = "merge" | "replace";

export interface VaultApi {
  vault: Vault;
  addVigil: (vigil: Vigil) => void;
  updateVigil: (id: string, patch: Partial<Vigil>) => void;
  removeVigil: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  importArchive: (text: string, mode: ImportMode) => number;
  exportArchive: () => string;
  seedSamples: () => number;
  clearVigils: () => void;
  resetVault: () => void;
}

export function useVault(): VaultApi {
  const [vault, setVault] = useState<Vault>(() => loadVault());

  useEffect(() => {
    saveVault(vault);
  }, [vault]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== VAULT_STORAGE_KEY || event.newValue === null) return;
      setVault(loadVault());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const addVigil = useCallback((vigil: Vigil) => {
    setVault((current) => ({ ...current, vigils: sortVigils([vigil, ...current.vigils]) }));
  }, []);

  const updateVigil = useCallback((id: string, patch: Partial<Vigil>) => {
    setVault((current) => ({
      ...current,
      vigils: current.vigils.map((vigil) => (vigil.id === id ? { ...vigil, ...patch } : vigil)),
    }));
  }, []);

  const removeVigil = useCallback((id: string) => {
    setVault((current) => ({
      ...current,
      vigils: current.vigils.filter((vigil) => vigil.id !== id),
    }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setVault((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  const importArchive = useCallback((text: string, mode: ImportMode) => {
    const imported = parseVaultImport(text);
    let added = 0;
    setVault((current) => {
      if (mode === "replace") {
        added = imported.vigils.length;
        return { version: 1, vigils: sortVigils(imported.vigils), settings: imported.settings };
      }
      const byId = new Map(current.vigils.map((vigil) => [vigil.id, vigil]));
      for (const vigil of imported.vigils) {
        if (!byId.has(vigil.id)) {
          byId.set(vigil.id, vigil);
          added += 1;
        }
      }
      return { ...current, vigils: sortVigils([...byId.values()]) };
    });
    return added;
  }, []);

  const exportArchive = useCallback(() => serializeVault(vault), [vault]);

  const seedSamples = useCallback(() => {
    const samples = buildSampleVigils();
    setVault((current) => {
      const existing = new Set(current.vigils.map((vigil) => vigil.id));
      const fresh = samples.filter((vigil) => !existing.has(vigil.id));
      return { ...current, vigils: sortVigils([...current.vigils, ...fresh]) };
    });
    return samples.length;
  }, []);

  const clearVigils = useCallback(() => {
    setVault((current) => ({ ...current, vigils: [] }));
  }, []);

  const resetVault = useCallback(() => {
    clearVaultStorage();
    setVault({ ...defaultVault(), settings: { ...defaultSettings() } });
  }, []);

  return {
    vault,
    addVigil,
    updateVigil,
    removeVigil,
    updateSettings,
    importArchive,
    exportArchive,
    seedSamples,
    clearVigils,
    resetVault,
  };
}
