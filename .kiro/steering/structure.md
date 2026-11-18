---
inclusion: always
---

# Structure — Vesper

## Repository map

```
/
├── src/
│   ├── main.tsx              boot + production service-worker registration
│   ├── App.tsx               hash router, shell, nav/footer, error boundary
│   ├── state/AppContext.tsx  vault, wallet, timer, sound, toasts, confirm, routing
│   ├── views/                Landing, Vigil, Return, Crypt, Settings
│   ├── components/           Backdrop, Candle, Nav, Sigil, ToastStack, ConfirmDialog, ErrorBoundary
│   ├── lib/                  pure domain + browser adapters (see below)
│   └── styles/app.css        all application styles (tokens, components, responsive)
├── public/                   manifest, sw.js, icons, og.png, favicon, robots.txt
├── scripts/                  generate-icons.mjs, verify-attestation.ts, kiro/*.mjs
├── tests/                    vitest unit tests
├── e2e/ or tests/e2e/        Playwright specs (golden path, screenshots)
├── contracts/                Hardhat 3 workspace (contract, tests, ignition, docs)
├── docs/                     architecture, web3, Kiro usage, demo script, screenshots
├── .kiro/                    specs, steering, hooks, MCP settings
└── .github/workflows/        Pages deployment
```

## `src/lib` responsibilities

| File | Responsibility |
| --- | --- |
| `types.ts` | Domain types, channel/ambience constants, presets. |
| `timer.ts` | Pure timer state machine and clamping. |
| `stats.ts` | Totals, streaks, seven-day series. |
| `attestation.ts` | Seal, EIP-712 typed data, verification. |
| `wallet.ts` | Injected + local keeper adapters, signing. |
| `transmissions.ts` | Deterministic prose. |
| `sigil.ts` | Deterministic SVG geometry. |
| `audio.ts` | Web Audio ambience engine + chime. |
| `storage.ts` | Load/save/export/import with sanitisation. |
| `site.ts` | Build-time configuration. |
| `files.ts` | Copy/download/slug helpers. |
| `hash.ts` | Seeded PRNG primitives. |
| `time.ts` | Clocks, dates, day keys. |
| `sample.ts` | Clearly-tagged sample vigils. |

## Routes

| Hash | View | Notes |
| --- | --- | --- |
| `#/` | Landing | Hero, pillars, recent proof. |
| `#/vigil` | Vigil | Setup or running ritual; redirects to `/return` if a just-finished vigil is pending. |
| `#/return` | Return | Transmission, sigil, attestation, optional mint. |
| `#/crypt` | Crypt | Stats, chart, constellation, detail panel, import/export. |
| `#/settings` | Settings | Ambience, sound, motion, wallet, archive. |

Unknown hashes render the landing view. The ritual is authoritative: while a snapshot exists the shell hides navigation and footer.

## Storage keys

- `vesper.vault.v1` — `{ version, vigils, settings }`.
- `vesper.timer.v1` — running/paused snapshot.
- `vesper.wallet.v1` — `{ kind, address, chainId, privateKey? }`.
- `vesper.vault.v1.corrupt.<timestamp>` — backup of unreadable vault text.

## Conventions

- **Files:** components/views `PascalCase.tsx`; libs `camelCase.ts`; tests `*.test.ts` next to or under `tests/`.
- **Imports:** relative within `src`; no path aliases; type-only imports with `import type`.
- **Components:** named exports for views/components; default export only for `App`.
- **CSS:** one stylesheet, BEM-ish (`block__element--modifier`), tokens as CSS custom properties. No inline styles except computed SVG attributes.
- **State:** one `AppProvider`; add new capabilities as a sub-hook inside `AppContext.tsx`, expose only what views need.
- **Purity:** anything that can be a pure function belongs in `lib` and gets a unit test.
- **Numbers:** seconds in `*Sec`, minutes in `*Min`/`*Minutes`, timestamps in `*At` (ms).
- **Errors:** user-facing messages are sentences; developer details go to `console.error` only.
- **No dead code:** delete unused exports rather than keeping compatibility shims.

## Adding a feature

1. Update or add a spec under `.kiro/specs/<feature>/`.
2. Put logic in `lib` with tests; keep views declarative.
3. Wire state in `AppContext.tsx`; reuse `toast`/`confirm`.
4. Follow the design system and accessibility rules.
5. Run `npm run typecheck`, `npm test`, `npm run build`; verify the route in a browser, including offline.
