import type { Hex } from "viem";

const contractValue = import.meta.env.VITE_SIGIL_CONTRACT ?? "";

export const SITE = {
  name: "Vesper",
  tagline: "Keep a vigil. Leave a sigil.",
  description:
    "A haunted focus ritual with live ambience, generative transmissions, and wallet-verifiable sigils.",
  repoUrl: (import.meta.env.VITE_REPO_URL ?? "https://github.com").replace(/\/+$/, ""),
  kiroweenUrl: "https://kiroween.devpost.com/",
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? "8453"),
  contract: contractValue as Hex | "",
  version: "0.1.0",
} as const;

export const hasConfiguredContract = SITE.contract.length === 42;
