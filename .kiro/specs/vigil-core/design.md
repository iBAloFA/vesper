# Design Document

## Overview

Vesper is a client-only React application built around one idea: a focus session should be **kept** rather than merely timed. The design separates the ritual (timer, ambience, return screen) from the record (seal, archive, proof), and makes the record deterministic so that anything shown later can be recomputed and checked.

The application ships as a static bundle with a relative base path, so the same build runs at a domain root, a GitHub Pages subpath, or from `file://`-adjacent static hosting without configuration. There is no backend. `localStorage` is the only persistence layer; a service worker supplies the offline shell.

```
┌──────────────────────────────────────────────────────────────┐
│ App.tsx — hash router, shell, background, skip link          │
│   AppContext.tsx — vault, wallet, timer, sound, toasts       │
│                                                              │
│   views/LandingView  views/VigilView  views/ReturnView       │
│   views/CryptView    views/SettingsView                      │
│                                                              │
│   lib/timer  lib/stats  lib/attestation  lib/transmissions   │
│   lib/sigil  lib/audio  lib/storage  lib/wallet  lib/files   │
└──────────────────────────────────────────────────────────────┘
```

## Architecture Decisions

| Decision | Rationale |
| --- | --- |
| Absolute `targetEnd` timestamps | Background-tab throttling and sleep must not distort the vigil. |
| Hash routing | Works on GitHub Pages without 404 rewrites; a reload lands on the same view. |
| No store library | The state surface is small; one context with memoised sub-hooks is enough. |
| Deterministic art | Transmission and sigil are pure functions of the seal/seed, so the archive can be re-rendered forever without stored images. |
| Web Audio synthesis | No binary assets, no licences, instant start, tiny bundle. |
| Storage sanitisation | A user can edit `localStorage`; the app must survive it and report corruption. |
| Seal over canonical string | One readable hash covers every meaningful field and detects edits. |

## Components and Interfaces

### `src/state/AppContext.tsx`

Owns the cross-view state and side effects:

- `route` / `navigate(route)` — parses `location.hash`, updates history, scrolls to top.
- `vault` — `{ vault, addVigil, removeVigil, seedSamples, importArchive, exportArchive, updateSettings, clearArchive }`.
- `wallet` — `{ record, createLocal, connectInjected, disconnect, signVigil, mint }`.
- `timer` — `{ snapshot, begin, pause, resume, finish, remaining }` backed by `useVigilTimer`.
- `sound` — `{ started, muted, start, stop, toggle, levels }` backed by a single `AmbienceEngine`.
- `returnVigil` — the vigil recently finished or opened from the crypt.
- `confirm` / `toast` — promise-based dialog and a bounded toast queue.

### `src/lib/timer.ts`

Pure functions over `TimerSnapshot`:

- `beginSnapshot(setup, now)` → running snapshot with `targetEnd = now + plannedSec × 1000`.
- `remainingSeconds(snapshot, now)` → paused value or `ceil((targetEnd − now) / 1000)`.
- `pauseSnapshot` / `resumeSnapshot` — invert each other without losing elapsed time.
- `finishSnapshot(snapshot, completed, now)` → `TimerResult` with honest `focusedSec`.
- `clampMinutes` → integer 1–180, invalid → 25.

`useVigilTimer` (inside `AppContext.tsx`) ticks at 4 Hz while the ritual is visible, persists every snapshot transition, schedules a single auto-finish timeout at `targetEnd`, and calls `handleAutoComplete` at most once per session id.

### `src/lib/attestation.ts`

- `buildSeal(vigil)` — `keccak256` of `vesper.seal.v1|id|startedAt|endedAt|plannedMin|focusedSec|completed|intention|ambience`.
- `messageId(vigilId)` — `keccak256(toBytes(vigilId))`.
- `buildTypedData(vigil, keeper, chainId, verifyingContract?)` — the EIP-712 object.
- `verifyAttestation(attestation)` — field checks, then viem `recoverTypedDataAddress`.

### `src/lib/transmissions.ts`

`composeTransmission` seeds `hashString(vigil.id + seal)`, selects opening, middle (completed vs released, with `{minutes}`), intention line (only when an intention exists), ambience line, and closing. Same inputs → same text.

### `src/lib/sigil.ts`

`buildSigil(seed)` derives a ring, polyline, and dot field from a seeded PRNG; `sigilSvg(seed, size)` serialises it with stable precision. The UI renders the geometry as React SVG and reuses `sigilSvg` for export, so screen and file agree.

### `src/lib/stats.ts`

`computeStats(vigils, now)` returns completed/released counts, total minutes, today's minutes, current streak, best streak, sealed count, sigil count, and a seven-day series. Streaks are computed on local calendar-day ordinals anchored to `startedAt`, with "today or yesterday" as the acceptable end.

### `src/lib/audio.ts`

`AmbienceEngine` lazily creates an `AudioContext`, one gain per channel and a master gain. Wind uses filtered noise; rain uses band-passed noise plus sparse droplets; hearth uses crackle bursts over low noise; drone uses two detuned oscillators; bells schedule inharmonic partials. `playChime` renders a two-strike bell on demand.

### `src/lib/storage.ts`

Keys: `vesper.vault.v1`, `vesper.timer.v1`, `vesper.wallet.v1`. Every read path runs through `sanitizeVigil`, `sanitizeAttestation`, `sanitizeSettings`, `sanitizeLevels`, `asAmbience`. On a parse failure the raw text is copied to `vesper.vault.v1.corrupt.<timestamp>` before the key is removed.

## Data Models

```ts
interface Vigil {
  id: string;              // UUID or fallback
  startedAt: number;       // local ms
  endedAt: number;
  plannedMin: number;      // 1..600
  focusedSec: number;      // 0..plannedMin*60
  completed: boolean;
  intention: string;       // ≤80
  ambience: AmbienceId;    // hollow | downpour | hearth | chapel | still
  levels: Record<ChannelId, number>; // 0..1
  seal: `0x${string}`;
  transmission: string;
  attestation?: StoredAttestation;
  onchain?: { txHash: `0x${string}`; chainId: number; contract: `0x${string}` };
  sample?: boolean;
}
```

The persisted vault wraps `{ version: 1, vigils: Vigil[], settings }`; the export wraps the same with `app: "vesper"` and `exportedAt`.

## Timer State Machine

```
idle ──begin──▶ running ──pause──▶ paused
                 │  ▲               │
                 │  └────resume─────┘
                 │
                 ├──release──▶ finished (completed = false)
                 └──targetEnd─▶ finished (completed = true)   [once]
```

Invariants:

1. `remainingSec` is always derived when running; the stored `remainingSec` is only authoritative for paused snapshots.
2. `focusedSec ≤ plannedSec` and `focusedSec = plannedSec` iff completed.
3. A session id is finished at most once.
4. A persisted running snapshot without a positive `targetEnd` is invalid and dropped.

## Persistence and Recovery

- Timer transitions write the snapshot synchronously; finishing clears it.
- On boot, a valid running snapshot with `targetEnd` in the past is finished immediately, producing a completed vigil and routing to `/return`.
- A paused snapshot survives reloads and is restored paused.
- Wallet and vault are written independently so a rejected signature never corrupts the archive.

## Offline / PWA

`public/sw.js` installs by fetching the shell and then parsing the built `index.html` for `assets/...` references. Each CSS file is scanned for `url(...)` references so fonts are cached too. Cached responses are rewritten to drop `content-encoding` and `content-length` (a cached gzip body must not be re-decoded), and lookups use `{ ignoreVary: true }` because Vite serves module scripts with `Vary`. Navigations are network-first with shell fallback; hashed assets are cache-first. Cache name is versioned (`vesper-v5`) and old caches are deleted on activate.

## Error Handling

| Failure | Behaviour |
| --- | --- |
| Corrupt vault | Back up raw text, reset, console error, app usable. |
| Storage write failure | Keep in-memory state, log, toast on export/settings. |
| Audio unsupported/blocked | Ritual continues silently; no unhandled rejection. |
| Wallet rejects signature | Inline error, vigil stays unsigned. |
| Wrong chain for mint | Block with instructions to switch. |
| Missing registry | Disable mint, explain configuration. |
| Render exception | `ErrorBoundary` shows a contained fallback keyed by route. |

## Testing Strategy

- **Unit (vitest):** timer invariants, pause/resume, completion, clamping; stats streaks and seven-day series across midnight; seal determinism and tamper detection; transmission determinism; sigil geometry bounds; vault sanitisation, corruption backup, import rejection; attestation sign/verify with viem accounts.
- **E2E (Playwright):** complete a 1-minute custom vigil by advancing time to the target, assert return screen, seal, and crypt entry; sign with a local keeper; export; import; offline reload against the preview server.
- **Contract (Hardhat 3 / node:test):** mint, duplicate, keeper mismatch, forged signature, validation errors, soulbound reverts, tokenURI decoding, locked semantics.
- **Static:** `tsc --noEmit` for app and contracts; production build must succeed.

## Correctness Properties

1. For any valid setup, `beginSnapshot` then `finishSnapshot(..., true)` yields `focusedSec == plannedSec`.
2. For any snapshot and clock `t`, `0 ≤ remainingSeconds(t) ≤ plannedSec`.
3. Pausing at `t` then resuming at `t'` preserves the remaining seconds exactly (modulo floor of 1s).
4. `verifySeal(v)` is true immediately after sealing and false after any field used by `buildSeal` changes.
5. `composeTransmission` and `buildSigil` are pure: identical seeds produce identical output.
6. Sanitised storage output always satisfies the domain ranges, or the record is dropped.
7. A completed vigil's `endedAt − startedAt` is consistent with `focusedSec` up to pause accounting.
