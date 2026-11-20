# Vesper

**Keep a vigil. Leave a sigil.**

Vesper turns deep work into a small, strange ceremony: a candle burns down while a live, procedural room of wind, rain, hearth and bells keeps time. When the hour is kept, a transmission and a deterministic sigil return with it — and a wallet signature can seal the record so anyone can verify it without trusting the app.

Built with **Kiro** (specs, steering, hooks, MCP) for **Kiroween 2026 — Vampire: Costume Contest**.

- **Live app:** [ibalofa.github.io/vesper](https://ibalofa.github.io/vesper/)
- **Demo video:** [youtu.be/-DEKGkE90d8](https://youtu.be/-DEKGkE90d8) — the published captioned walkthrough. The current recut is [docs/vesper-demo.mp4](docs/vesper-demo.mp4) (33 s, silent, captions burned in, sidecar [.srt](docs/vesper-demo.srt)); the v0.2 proof walkthrough is [docs/vesper-solana-demo.mp4](docs/vesper-solana-demo.mp4) with its [.srt](docs/vesper-solana-demo.srt). The longer narrated storyboard, not yet filmed, is in [docs/demo-script.md](docs/demo-script.md)
- **Design notes:** [docs/architecture.md](docs/architecture.md) · [docs/web3-design.md](docs/web3-design.md) · [docs/solana-design.md](docs/solana-design.md) · [docs/audit-brief.md](docs/audit-brief.md) (invariants and attack surface)
- **How Kiro was used:** [docs/kiro-usage.md](docs/kiro-usage.md)

> **Version note.** The live app now runs v0.2: Ed25519 seals, an encrypted local keeper, Wallet
> Standard signing, clock evidence, a signed release ledger, and an immutable Anchor registry
> deployed to devnet at `94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX`. A vigil can be minted and
> released on devnet from the live build. The Kiroween entry build is kept, unchanged in behaviour,
> at [`/v1/`](https://ibalofa.github.io/vesper/v1/) — see [The v0.1 archive](#the-v01-archive).

<p align="center">
  <img src="docs/screenshots/landing.png" alt="Vesper landing page with altar, candle, and sigil" width="49%" />
  <img src="docs/screenshots/ritual.png" alt="A vigil in progress with candle and clock" width="49%" />
</p>
<p align="center">
  <img src="docs/screenshots/return.png" alt="The return view with a sealed sigil and transmission" width="49%" />
  <img src="docs/screenshots/crypt.png" alt="The crypt with stats, constellation, and ledger" width="49%" />
</p>

## What it does

- **The vigil** — 5–45 minute presets or a custom 1–180 minute session. The timer is derived from wall-clock time (`targetEnd`), so pausing, hiding the tab, or throttled timers cannot steal or inflate minutes. A vigil can be finished early or released; only completed time counts toward streaks.
- **A live room** — five independent synthesized channels (wind, rain, hearth, drone, bells) built with the Web Audio API. Five presets, per-channel levels, master volume, and a sound toggle. No samples, no streaming, no network.
- **Séance transmissions** — a deterministic, locally composed passage derived from the vigil's seal, intention, ambience, duration and outcome. The same vigil always yields the same words.
- **Sigils** — a deterministic SVG generated from the seal, in the app's palette, used as the vigil's mark and the contract's on-chain artwork.
- **The crypt** — total focus, current and best streak, today's minutes, sealed count, a seven-day chart, a constellation where every vigil is a star, filters, a detail page, and a transmission ledger.
- **Local-first archive** — `localStorage` with sanitisation on every read, corrupt-vault backup, JSON export/import, single-attestation download.
- **Proof of focus** — EIP-712 attestations signed by a local keeper or a browser wallet, verified in-app by signer recovery, plus a standalone verifier that imports only viem.
- **Proof of focus, v0.2** — the same record can be sealed with Ed25519 on Solana: an encrypted local keeper or a Wallet Standard wallet signs one canonical message, the seal is SHA-256 over the record, and clock evidence is signed with it. Records label their chain, and the verifier routes v1 and v2 in one command. A seal can be minted as a soulbound Token-2022 sigil through the devnet registry, whose upgrade authority is already burned.
- **Optional registry** — an immutable, ownerless, soulbound ERC-721 (`VesperSigils.sol`) with mint-once semantics and fully on-chain base64/SVG metadata.
- **PWA** — installable, offline-capable, hash-routed, with reduced-motion support and a self-hosted font stack.

## Quick start

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>. Node 20 or newer; Node 24 is used in CI.

No environment variables are required. To point the app at a deployed registry or a different chain, copy `.env.example` to `.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SIGIL_CONTRACT` | empty | Address of a deployed `VesperSigils`. Empty disables minting. |
| `VITE_CHAIN_ID` | `8453` | Expected chain (Base mainnet); `84532` for Base Sepolia. |
| `VITE_REPO_URL` | `https://github.com` | Repository URL used by in-app links. |
| `VITE_SOLANA_CLUSTER` | `devnet` | Cluster named in every v0.2 sealed message. |
| `VITE_SOLANA_RPC` | `https://api.devnet.solana.com` | RPC endpoint for v0.2 mint and lookups. |
| `VITE_VESPER_PROGRAM` | empty | Solana registry id. Empty seals as `program=unminted`. |

Build and preview the production bundle:

```bash
npm run build
npm run preview
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server. |
| `npm run build` | Typecheck, then build to `dist/`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Unit tests (Vitest). |
| `npm run test:e2e` | End-to-end and offline tests (Playwright; builds, previews, then runs the `e2e` and `offline` projects). |
| `npm run screenshots` | Regenerate README/crypt screenshots (Playwright, `screenshots` project). |
| `npm run demo` | Record the demo flow artifacts (Playwright, `demo` project). |
| `npm run verify:attestation -- <file>` | Verify an attestation or archive with the independent verifier. |
| `npm run icons` | Regenerate PWA icons and the OG image. |
| `npm run lint` | ESLint. |

Contracts:

```bash
cd contracts
npm ci
npm test                 # 9 passing
npx hardhat build
npx tsc --noEmit
```

## Proof of focus

A sealed vigil signs this typed message:

```
Vigil(bytes32 id, address keeper, string startedAt, uint32 durationMin, bytes32 seal)
```

- Domain: `("Vesper", "1", chainId, verifyingContract?)`.
- `id` is `keccak256` of the vigil's string id.
- `startedAt` is a digit-only decimal string. It never becomes a JavaScript `Date` inside the signed payload.
- `durationMin` is an integer from 1 to 600. The app caps a session at 180 minutes, but the signed schema accepts older or imported records up to 600.
- `seal` is `keccak256("vesper.seal.v1|<id>|<startedAt>|<endedAt>|<plannedMin>|<focusedSec>|<completed|released>|<intention>|<ambience>")`.

Sealing is optional. An unsigned vigil is labelled unsealed, not "verified". The UI shows a signature as verified only after the app recovers the signer and matches the keeper.

Verify without trusting Vesper:

```bash
npm run verify:attestation -- attestation.json
npm run verify:attestation -- vesper-archive.json
npm run verify:attestation -- archive.json --rpc https://api.devnet.solana.com
npm run verify:attestation -- archive.json --revocations public/revocations.ndjson
```

The verifier imports `viem` only, checks the shape and domain, recovers the signer, and (for archives) recomputes the seal from the record. See [docs/web3-design.md](docs/web3-design.md) for the full threat model.

### Solana v0.2

The same vigil can instead be sealed with Ed25519. The panel on the return view offers an encrypted
local keeper or a Wallet Standard wallet; either signs this canonical message:

```text
vesper.vigil.v2
cluster=devnet
program=unminted
sigil=<sha256("vesper.sigil.v2|" + vigil.id)>
keeper=<base58>
startedAt=<digit-only decimal>
durationMin=<1–600>
focusedSec=<digits>
outcome=completed|released
clockDriftMs=<milliseconds|unknown>
seal=<sha256 of the canonical record string>
```

- The seal is `sha256("vesper.seal.v2|sigil|startedAt|endedAt|plannedMin|focusedSec|outcome|intention|ambience|drift")`.
- The local keeper's 64-byte secret is wrapped with PBKDF2-SHA256 (600,000 iterations) and
  AES-256-GCM at `vesper.keeper.v2`. The passphrase is never stored; the keeper locks on reload and
  after 15 minutes idle.
- The app verifies every new attestation before storing it, and labels a record sealed only after
  the signature and seal match.
- Clock evidence (wall clock versus `performance.now()`) is signed with the record. Over 2,000 ms of
  drift the record is labelled "clock moved". This is evidence, not proof of honest time.
- The verifier routes by version, recomputes the seal, and can check the shipped release ledger with
  `--revocations` and the on-chain head with `--rpc`.

The Anchor program lives in `solana/` with host tests for layouts, bounds and the Ed25519 check;
the mint and release flows are wired into the return view and stay dormant until a program id is
configured. Deploying to devnet is an operator step. Full format, account layouts, the ledger and
the threat model: [docs/solana-design.md](docs/solana-design.md).

### Registry (optional)

`contracts/contracts/VesperSigils.sol` is a soulbound ERC-721 with ERC-5192 `locked()`:

- One mint per sigil id, signature-bound to the keeper.
- `approve`, `setApprovalForAll`, and every transfer path revert with `Soulbound()`.
- No owner, proxy, burn, or upgrade path.
- `tokenURI` is self-contained base64 JSON with an inline SVG; both strings are escaped.

The contract is tested but **not audited and not deployed** in this release. Deployment is an operator action:

```bash
cd contracts
BASE_SEPOLIA_RPC_URL=... DEPLOYER_PRIVATE_KEY=... npm run deploy:baseSepolia
```

Keys are read from the environment only. Never write them to a file. Set `VITE_SIGIL_CONTRACT` and `VITE_CHAIN_ID=84532` to enable minting in a build.

## Architecture

```text
src/
  views/        Landing, Vigil, Return, Crypt, Settings
  components/   Nav, Sigil, Candle, Backdrop, ConfirmDialog, ToastStack, ErrorBoundary, SolanaSealPanel
  state/        AppContext (vault, timer, wallet, routing, audio)
  hooks/        useVault, useVigilTimer, useWallet, useSolanaKeeper, useSolanaWallet
  lib/          timer, attestation, wallet, storage, transmissions, sigil, stats, audio, time, files, hash
  lib/proof/    canonical v2 message, seal, attestation, keeper, keystore, clock, ledger, wallet-standard
  styles/       tokens, layout, components, motion
public/         manifest, service worker, icons, OG image, revocations.ndjson, v1/ (v0.1 archive)
contracts/      Hardhat 3 + viem + OpenZeppelin soulbound registry
.kiro/          specs, steering, hooks, MCP
scripts/        verifier, Solana PDA readers, Kiro hook scripts, icon generation, v0.1 snapshot
```

- **No backend.** Nothing is uploaded; there are no analytics or remote assets.
- **Pure core.** Timer, seal, transmission, sigil, stats and sanitisation live outside React and are unit-tested.
- **Honest recovery.** The UI distinguishes sealed/verified, sealed/unverifiable, and unsealed.
- **Offline.** A custom service worker precaches the build, handles navigation fallback, and ignores encoding-sensitive `Vary` headers for same-origin assets.

More detail: [docs/architecture.md](docs/architecture.md).

## Built with Kiro

| Capability | Where |
| --- | --- |
| Spec-driven development | `.kiro/specs/vigil-core/`, `.kiro/specs/proof-of-focus/` |
| Steering | `.kiro/steering/` — product, tech, structure, design system, Web3 security, submission and demo playbooks |
| Agent hooks | `.kiro/hooks/` — typecheck on save, contract tests on save, verification after spec tasks, secret/publish guard, session briefs, post-compaction reminder |
| MCP | `.kiro/settings/mcp.json` — Playwright for browser verification |
| Portable agent rules | `AGENTS.md`, `contracts/AGENTS.md` |

The three hooks worth knowing:

- `guard-secrets` blocks `.env`/key writes, secret reads, unapproved pushes and releases, testnet/mainnet deploys, and force pushes. The hook exits with code 2 and explains why.
- `spec-task-verify` runs typecheck, app tests and contract tests after each spec task.
- `typecheck-on-save` keeps TypeScript honest while editing.

Full write-up, including the spec → code traceability table and the PWA debugging loop: [docs/kiro-usage.md](docs/kiro-usage.md). Real session captures are in [docs/kiro-evidence/](docs/kiro-evidence/README.md) — spec views, steering, both hook surfaces, a firing hook, a blocked secret read, and Playwright verification of the deployed app. They are never mocked.

## Deployment

GitHub Actions builds and publishes `dist/` to GitHub Pages on every push to `main`:

1. Create a public repository and push `main`.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. The workflow runs tests, builds with `VITE_REPO_URL` derived from the repository, and deploys.
4. Optionally set repository variables `VITE_CHAIN_ID` and `VITE_SIGIL_CONTRACT` for EVM minting.
5. Optionally set `VITE_VESPER_PROGRAM` (the devnet program id) to enable Solana minting. Without it
   the app seals as `unminted`. The v0.1 archive under `/v1/` needs no variable; it ships in `public/`.

The Vite base is `./`, so the app works from a project subpath. Hash routing means no server rewrite is required.

## The v0.1 archive

The Kiroween entry was filmed against v0.1. That build is kept at `/v1/` (for example
[ibalofa.github.io/vesper/v1](https://ibalofa.github.io/vesper/v1/)) next to v0.2, so the upgrade can
be compared directly. The landing page, the footer and the settings page link to it; the archive
carries a fixed badge back to the current build.

- The snapshot is built from the entry commit (`07dccef`) with its three storage keys suffixed
  `.archive` (`VAULT_KEY`, `TIMER_KEY`, `WALLET_KEY` in `src/lib/storage.ts`, and
  `VAULT_STORAGE_KEY` in `src/hooks/useVault.ts`). Behaviour is otherwise untouched. v0.1's
  sanitizer drops fields it does not know, so a shared vault would quietly destroy v0.2 records;
  each build now keeps its own.
- It ships a no-op service worker in place of v0.1's. Both versions used the cache name
  `vesper-v5`, and two workers sharing one cache would evict each other. The no-op worker also keeps
  the live site's worker from answering `/v1/` navigations offline with the v0.2 shell.

To regenerate the snapshot from the entry commit:

```bash
git worktree add /tmp/vesper-v1-build 07dccef
cd /tmp/vesper-v1-build
npm ci
# suffix the four storage keys above with ".archive"
VITE_REPO_URL=https://github.com/iBAloFA/vesper npm run build
cd -
node scripts/build-v1-snapshot.mjs /tmp/vesper-v1-build/dist
git worktree remove /tmp/vesper-v1-build
```

## Accessibility and privacy

- Semantic landmarks, focus-visible styles, skip link, labelled controls, live regions for timer state and toasts.
- Respects `prefers-reduced-motion` and offers a Reduce motion setting.
- Colour contrast is checked for body copy and controls on the dark palette.
- Audio is opt-in; the app starts silent until the sound control is pressed.
- Intentions, archives, signatures and local keeper keys never leave the browser.

## Limitations

- The EVM registry is unaudited; use a testnet first.
- The Solana program lives in `solana/`, builds with Anchor 0.31.3, and is deployed to devnet at
  `94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX` with the upgrade authority set to none, so its
  rules are permanent. It is unaudited. Minting and releasing run from the local keeper; wallet
  signing still seals without minting. A build without `VITE_VESPER_PROGRAM` seals as `unminted`
  and cannot mint. A release writes the updated ledger file for you to commit, and the ledger page
  reads the shipped file.
- The v0.1 local keeper stores its EIP-712 private key unencrypted in `localStorage` for low-friction
  test vigils. Do not use it with funds. The v0.2 Solana keeper is encrypted, but the app is still
  unaudited.
- Sealing proves the keeper signed the record, not that the device clock was honest. Clock drift is
  recorded as evidence; a clock that was wrong before the vigil began cannot be detected.
- Signatures cannot be revoked in v0.1; an exported attestation remains valid evidence. In v0.2 a
  release is a signed notice that a verifier sees only through the ledger file or the program. A
  stale ledger can hide a release, and a verifier with neither the file nor RPC access sees neither.
- This release ships verification locally; on-chain minting is optional and stays dormant unless a
  program id is configured.

## Licence

MIT — see [LICENSE](LICENSE). Fonts are self-hosted from Fontsource (SIL Open Font License). The app contains no sampled audio; all sound is synthesized at runtime.
