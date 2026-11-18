import type { Hex } from "viem";

const contractValue = import.meta.env.VITE_SIGIL_CONTRACT ?? "";
const solanaProgram = (import.meta.env.VITE_VESPER_PROGRAM ?? "").trim();

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

export const SOLANA = {
  cluster: (import.meta.env.VITE_SOLANA_CLUSTER ?? "").trim() || "devnet",
  rpc: (import.meta.env.VITE_SOLANA_RPC ?? "").trim() || "https://api.devnet.solana.com",
  program: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solanaProgram) ? solanaProgram : null,
} as const;
