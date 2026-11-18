# Architecture

Vesper is a static, client-only application. There is no API, database, account system, or telemetry. A visitor's focus history lives in `localStorage`; the only optional network call is an RPC transaction when the visitor chooses to mint a proof on-chain.

## Runtime shape

```
┌─────────────────────────────────────────────────────────────────┐
│ index.html                                                       │
│  └─ main.tsx ── render <App> ── register service worker (PROD)   │
│                                                                  │
│ AppProvider (state/AppContext.tsx)                               │
│  ├─ useVault      archive, settings, import/export              │
│  ├─ useWallet     injected / local keeper, sign, mint           │
│  ├─ useVigilTimer running/paused snapshot, auto-finish          │
│  ├─ AmbienceEngine Web Audio synthesis                          │
│  └─ toasts + confirm dialog                                     │
│                                                                  │
│ App.tsx shell                                                    │
│  ├─ Backdrop (stars, fog, candle, reduced-motion aware)         │
│  ├─ Nav / Footer (hidden during a ritual)                       │
│  └─ ErrorBoundary keyed by route                                │
│      └─ Landing | Vigil | Return | Crypt | Settings             │
└─────────────────────────────────────────────────────────────────┘
```

## Module map

| Module | Kind | Responsibility |
| --- | --- | --- |
| `src/App.tsx` | UI shell | Hash router, skip link, nav/footer visibility, error boundary. |
| `src/state/AppContext.tsx` | state | Orchestrates vault, wallet, timer, audio, toasts, confirmations. |
| `src/views/*` | UI | Five routes, each a focused screen. |
| `src/components/*` | UI | Reusable visual and dialog primitives. |
| `src/lib/timer.ts` | pure | Snapshot transitions and clock-derived remaining time. |
| `src/lib/stats.ts` | pure | Streaks, totals, seven-day series. |
| `src/lib/attestation.ts` | pure | Seal, EIP-712 typed data, signer recovery. |
| `src/lib/wallet.ts` | adapter | EIP-1193 + local key backends. |
| `src/lib/storage.ts` | adapter | Sanitised persistence, export/import. |
| `src/lib/audio.ts` | adapter | Web Audio ambience and chime. |
| `src/lib/transmissions.ts` | pure | Deterministic prose. |
| `src/lib/sigil.ts` | pure | Deterministic SVG geometry. |
| `src/lib/site.ts` | config | Build-time env with safe defaults. |

## The ritual flow

```
setup ─▶ beginSnapshot ─▶ running ⇄ paused ─▶ finishSnapshot ─▶ Vigil record
                                                   │
                                                   ├─ seal = keccak(canonical record)
                                                   ├─ transmission = f(seed)
                                                   ├─ sigil = f(seed)
                                                   └─ optional attestation = sign(typed data)
```

The timer never counts down by mutation. A running snapshot stores `targetEnd`; every render derives the remaining seconds from `Date.now()`. This makes background-tab throttling, sleep, and reloads harmless. Finishing is idempotent per `sessionId`.

## Determinism

Both the transmission and the sigil are pure functions of the vigil seed (`id + seal`). The same record renders identically in the return view, the crypt, and any future export. Nothing visual needs to be stored as an asset.

## Data model

```
Vault { version, vigils: Vigil[], settings }
Vigil {
  id, startedAt, endedAt, plannedMin, focusedSec, completed,
  intention, ambience, levels, seal, transmission,
  attestation?, onchain?, sample?
}
```

Persisted keys:

- `vesper.vault.v1`
- `vesper.timer.v1`
- `vesper.wallet.v1`

All reads are sanitised field by field. A corrupt vault is backed up under `vesper.vault.v1.corrupt.<ts>` and reset rather than crashing the app.

## Proof of focus

```
Vigil ──seal──▶ typed data ──sign──▶ attestation ──recover──▶ verified?
                                    │
                                    ├──▶ JSON export ──▶ scripts/verify-attestation.ts
                                    └──▶ optional mint ──▶ VesperSigils (soulbound ERC-721)
```

The seal covers the whole record; the signature covers the seal, id, keeper, start, and duration. Verification recomputes both. The registry re-verifies the same typed data on-chain. See [web3-design.md](web3-design.md).

## Offline / PWA

`public/sw.js`:

1. Precache the shell (`./`, `index.html`, icons, manifest).
2. Fetch the built `index.html`, extract hashed `assets/...` references, cache each one.
3. Scan cached CSS for `url(...)` fonts and cache those recursively.
4. Strip `content-encoding` / `content-length` from cached responses (cached bodies are decoded).
5. Use `{ ignoreVary: true }` on lookups, because Vite serves module scripts with `Vary`.
6. Network-first navigations with shell fallback; cache-first hashed assets.
7. Versioned cache (`vesper-v5`); old caches are deleted on activate.

The service worker registers only in production builds, so development is never served stale.

## Accessibility

- One `h1` per view and semantic heading order.
- Skip link focuses `main` without changing the hash.
- `role="timer"` with a pluralised label; a separate polite live region announces state changes, not every second.
- Visible focus rings and 44 px targets.
- Reduced motion honours both the stored setting and `prefers-reduced-motion`.
- Dialogs trap focus, close on Escape, and restore focus.
- Layout verified at 320 px and 200% zoom.

## Error strategy

| Boundary | Strategy |
| --- | --- |
| Storage | Validate and clamp; back up corruption; never throw into render. |
| Audio | Lazy init; tolerate missing/blocked `AudioContext`; no unhandled rejections. |
| Wallet | Validate everything from the provider; surface plain-language errors; leave the vigil unsigned. |
| Render | Route-keyed `ErrorBoundary` with a contained fallback. |
| Contract | Custom errors mapped to human messages; unconfigured state is explicit. |

## Testing

| Layer | Tool | Covers |
| --- | --- | --- |
| Unit | Vitest | Timer invariants, stats, seals, transmissions, sigils, storage, attestations. |
| E2E | Playwright | Golden path, sealing, export/import, offline reload. |
| Contract | Hardhat 3 + node:test | Mint, validation, soulbound, metadata, `locked`. |
| Static | TypeScript | App and contracts. |

## Deployment

A GitHub Actions workflow builds with Node 24 and publishes `dist/` to GitHub Pages. `base: "./"` makes the same artifact work at a project subpath. No secrets are required for the static build; contract addresses, if any, come from repository variables.
