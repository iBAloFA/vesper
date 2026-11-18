/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPO_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_SIGIL_CONTRACT?: string;
  readonly VITE_SOLANA_CLUSTER?: string;
  readonly VITE_SOLANA_RPC?: string;
  readonly VITE_VESPER_PROGRAM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
