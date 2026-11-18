---
inclusion: always
---

# Technology — Vesper

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Build | Vite 8 (`base: "./"`) | Relative assets so the build works at a domain root or a Pages subpath. |
| UI | React 19 + TypeScript 6 (strict) | Function components, hooks, no state library. |
| Crypto | viem 2 (v1), tweetnacl + WebCrypto (v2) | EIP-712 recovery for v1; Ed25519, SHA-256 and AES-GCM for v2. |
| Solana | bs58, `@solana/web3.js` (verifier only) | Wallet Standard signing stays behind a dynamic import. |
| Audio | Web Audio API | Synthesised channels; no media files. |
| PWA | Hand-written `public/sw.js` + manifest | Versioned cache, HTML asset discovery, CSS font recursion. |
| Tests | Vitest 5, Playwright 1.65 | Unit + Chromium golden path. |
| Contracts | Hardhat 3 (ESM), Solidity 0.8.34, OpenZeppelin 5.6 | `node:test` TypeScript tests, toolbox-viem, Ignition. |
| CI/Deploy | GitHub Actions → GitHub Pages | `dist/` artefact; no secrets needed for the static build. |

## Commands

```
npm run dev               # Vite dev server
npm run typecheck         # tsc --noEmit (app)
npm test                  # vitest run
npm run test:e2e          # Playwright, e2e and offline projects
npm run build             # typecheck + vite build
npm run preview           # preview dist on :4173
npm run verify:attestation -- <file>
npm run verify:attestation -- <file> --rpc <url> --revocations <file|url>
npm run icons             # regenerate PWA/OG images

cd contracts
npx hardhat build         # compile + generate types
npm test                  # hardhat test (node:test)
npx tsc --noEmit
npm run deploy:baseSepolia
```

## Environment

| Variable | Used by | Default |
| --- | --- | --- |
| `VITE_REPO_URL` | Footer links | `https://github.com` |
| `VITE_SIGIL_CONTRACT` | Optional on-chain mint | empty → unconfigured |
| `VITE_CHAIN_ID` | Local keeper domain | `8453` (Base) |
| `VITE_SOLANA_CLUSTER` | v0.2 message and wallet chain | `devnet` |
| `VITE_SOLANA_RPC` | v0.2 mint and lookup | `https://api.devnet.solana.com` |
| `VITE_VESPER_PROGRAM` | v0.2 registry | empty → `program=unminted` |
| `BASE_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `SEPOLIA_RPC_URL` | Hardhat | none |
| `DEPLOYER_PRIVATE_KEY` | Hardhat deploy only | none |

`.env` files are ignored. Never print or commit their values. `.env.example` contains placeholders only.

## Engineering rules

1. **No backend.** Do not add API calls, telemetry, or uploads. The only network activity allowed is the optional RPC call for minting, and only when a registry is configured.
2. **Time comes from the clock.** Timer logic derives from `targetEnd` and `Date.now()`; no decrementing counters.
3. **Pure core, thin views.** Domain logic lives in `src/lib/*` as pure functions. Views compose; they do not compute seals or stats.
4. **Validate at boundaries only.** Storage and wallet input are boundaries (sanitise); internal calls trust types.
5. **No new dependencies** without a concrete need and a bundle-size justification. Prefer platform APIs.
6. **Typecheck before done.** `npm run typecheck` (and `npx tsc --noEmit` in `contracts/`) must pass; tests must be green.
7. **Verify in a browser.** For UI changes, run the feature against the dev or preview build; typechecks are not feature tests.
8. **Accessibility is part of done.** Keyboard path, labels, focus visibility, reduced motion, live announcements.
9. **Offline is part of done.** After changing assets or fonts, re-test an offline reload against the preview build.
10. **Do not touch shared state.** No pushes, releases, Pages changes, or external posts without explicit user approval.
11. **Secrets never enter the repo.** If a command needs a key, it reads it from the environment.
12. **Keep the tone.** New copy follows `product.md`; no exclamation marks, no growth-hack language.

## Known constraints

- `localStorage` is the only persistence; quota errors must degrade gracefully.
- `crypto.randomUUID` may be unavailable in insecure contexts; the timer has a fallback.
- Service worker registration is production-only.
- Injected wallets are optional; local keepers must never require an extension.
- Base mainnet default chain id is 8453; deployments to testnets require explicit env configuration.
- The Solana program needs WSL2 with Rust, the Solana CLI and Anchor; it is not built or deployed yet.
- Devnet can be reset by its operators, which wipes the program and every sigil.
- The Hardhat build downloads solc 0.8.34 on first run; CI must allow network access for the contracts job.
