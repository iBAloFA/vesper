# Implementation Plan

## Task 1 — Project scaffold and shell

- [x] 1.1 Create the Vite + React + TypeScript application with a relative base path and strict compiler settings. (Req 8.1, 8.6)
- [x] 1.2 Implement hash routing for `/`, `/vigil`, `/return`, `/crypt`, `/settings`, with unknown routes falling back to the landing view. (Req 10.1, 10.2)
- [x] 1.3 Build the shell: backdrop, navigation, footer, skip link that focuses `main`, and route-keyed error boundary. (Req 9.1, 10.3)

## Task 2 — Domain types and constants

- [x] 2.1 Define channel ids, ambience presets, vigil, settings, vault, timer snapshot, and timer result types. (Req 1.5, 6.1)
- [x] 2.2 Provide preset level maps and a safe `getAmbience` fallback. (Req 1.5)

## Task 3 — Timer engine

- [x] 3.1 Implement `beginSnapshot`, `remainingSeconds`, `pauseSnapshot`, `resumeSnapshot`, `finishSnapshot`, and `autoFinishAt` as pure functions. (Req 2.1–2.4, 2.7)
- [x] 3.2 Clamp minutes to 1–180 and normalise intentions to 80 characters. (Req 1.2, 1.3)
- [x] 3.3 Persist snapshots on every transition and restore them on boot, discarding invalid ones. (Req 2.5, 2.6)
- [x] 3.4 Schedule a single auto-finish at the target, guarded by session id, and route to the return screen. (Req 2.8)
- [x] 3.5 Expose the countdown with `role="timer"`, pluralised labels, and polite announcements. (Req 2.9)

## Task 4 — Ambience engine

- [x] 4.1 Implement the Web Audio engine with five channels, per-channel gain, smooth ramps, and master gain. (Req 3.1, 3.2)
- [x] 4.2 Suspend and resume with document visibility, respecting the running session and mute state. (Req 3.4)
- [x] 4.3 Start audio on a user gesture and tolerate blocked or unsupported contexts. (Req 3.5)
- [x] 4.4 Add the completion chime and wire it to finish/release. (Req 3.6)

## Task 5 — Ritual view

- [x] 5.1 Build the setup form: intention with counter, chips for 5/15/25/45, custom minutes, preset picker, mixer. (Req 1.1–1.5)
- [x] 5.2 Build the running view: candle, clock, intention, pause/resume, release with confirmation, sound toggle. (Req 1.6, 2.2–2.3)
- [x] 5.3 Ensure the ritual hides navigation and footer, and restores them after finishing. (Req 1.6)
- [x] 5.4 Verify keyboard operation and screen-reader labels on every control. (Req 9.1, 9.3)

## Task 6 — Seal, transmission, sigil

- [x] 6.1 Implement the canonical seal string and `keccak256` helper. (Req 4.2)
- [x] 6.2 Implement deterministic transmissions with completed/released variants and optional intention/ambience lines. (Req 4.3)
- [x] 6.3 Implement the seeded sigil geometry and SVG serialiser. (Req 4.3)
- [x] 6.4 Provide SVG download/copy and record/attestation JSON download. (Req 4.4, 4.5)

## Task 7 — Return view

- [x] 7.1 Render intention, duration, date, ambience, transmission, and sigil after a session. (Req 4.1)
- [x] 7.2 Show seal status (verified vs altered) and per-vigil attestation state. (Req 4.6, 7.5)
- [x] 7.3 Support reopening any archived vigil in the return view and clearing the return state on exit. (Req 5.6)

## Task 8 — Crypt and statistics

- [x] 8.1 Implement `computeStats`: totals, today, current/best streak, sealed count, seven-day series. (Req 5.2–5.4)
- [x] 8.2 Build the empty state and the populated crypt with stat cards and bar chart. (Req 5.1, 5.4)
- [x] 8.3 Build the constellation with deterministic positions, sample styling, keyboard selection, and a detail panel. (Req 5.5–5.7)
- [x] 8.4 Add delete with confirmation, sample seeding/removal, export, and import. (Req 5.8, 6.5–6.7, 7.5)

## Task 9 — Persistence hardening

- [x] 9.1 Implement vault, timer, and wallet loaders with full sanitisation and clamping. (Req 6.1, 6.2)
- [x] 9.2 Back up and reset corrupt vaults instead of throwing. (Req 6.3)
- [x] 9.3 Implement merge import with duplicate protection and precise error messages. (Req 6.6)
- [x] 9.4 Confirm destructive actions and report results via toasts. (Req 5.8, 6.7, 9.3)

## Task 10 — Settings

- [x] 10.1 Build the settings grid: ambience defaults, mixer, master volume, reduced motion. (Req 7.1–7.3)
- [x] 10.2 Persist preferences immediately and apply reduced motion to all decorative components. (Req 7.4, 9.4)
- [x] 10.3 Add archive statistics, sample management, export/import, and clear-with-confirmation. (Req 7.5, 6.7)

## Task 11 — Installable offline app

- [x] 11.1 Add manifest with name, theme, maskable icons, and shortcuts. (Req 8.7)
- [x] 11.2 Generate 192/512/maskable/apple icons and an OG image from a single script. (Req 8.7)
- [x] 11.3 Implement the service worker: shell precache, HTML asset discovery, CSS font recursion, encoding-header cleanup, `ignoreVary`, versioned caches. (Req 8.1–8.5)
- [x] 11.4 Register the service worker in production only and verify offline reload with fonts and zero console errors. (Req 8.3)

## Task 12 — Quality gates

- [x] 12.1 Add unit tests for timer, stats, seal, transmissions, sigil, and storage. (Req 11.2)
- [x] 12.2 Add a Playwright golden-path test against the preview build. (Req 11.3)
- [x] 12.3 Make `npm run build` typecheck before bundling. (Req 11.1, 11.4)
- [ ] 12.4 Add visual regression snapshots for the five routes once the design stabilises. (Req 11.3)

## Task 13 — Accessibility and copy pass

- [x] 13.1 Pluralise every unit (minute/day/vigil/sample) across views and toasts. (Req 9.7)
- [x] 13.2 Verify 320 px layout, focus visibility, and one `h1` per view. (Req 9.1, 9.2, 9.6)
- [x] 13.3 Audit empty, error, and offline states for accurate wording. (Req 10.3)
