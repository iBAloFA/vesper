# Requirements Document

## Introduction

Vesper is a single-page focus ritual: the visitor names one intention, chooses a length and a room of sound, keeps a timer, and — when the vigil ends — receives a transmission and a deterministic sigil that is archived in a local crypt. This specification covers the ritual itself, its persistence, the archive, and the presentation-layer guarantees that make the app safe to use offline and with assistive technology.

The product is local-first. No account, server, or upload is required for anything in this spec. Time is the only thing the user spends.

## Glossary

- **Vigil** — one focus session: intention (≤80 chars), planned minutes, focused seconds, ambience, levels, timestamps, seal, transmission, sigil seed.
- **Seal** — `keccak256` of the canonical vigil record; changes if any archived field is edited.
- **Transmission** — a short deterministic poetic line derived from the vigil's seed.
- **Sigil** — deterministic SVG geometry derived from the same seed.
- **Snapshot** — the persisted timer state (`vesper.timer.v1`).
- **Vault** — the persisted archive and settings (`vesper.vault.v1`).
- **Sample vigils** — clearly tagged demo records that can be added and removed.

## Requirements

### Requirement 1: Begin a vigil

**User Story:** As a visitor, I want to set one intention and a length, so that the session has a single clear purpose.

#### Acceptance Criteria

1. WHEN the visitor opens `/vigil` without a running session THE SYSTEM SHALL present an intention field (max 80 characters with a live counter), length chips for 5, 15, 25, and 45 minutes, a custom length option, an ambience preset picker, and a per-channel mixer.
2. WHEN the visitor submits a length THE SYSTEM SHALL clamp custom minutes to the integer range 1–180 and default invalid input to 25.
3. WHEN the visitor submits the form THE SYSTEM SHALL normalise the intention (collapse whitespace, trim, truncate to 80) and start a running snapshot with `plannedSec = minutes × 60`.
4. WHEN the visitor starts a session with an empty intention THE SYSTEM SHALL use "An unnamed vigil" in all display surfaces without mutating the stored intention.
5. WHEN the visitor chooses an ambience preset THE SYSTEM SHALL replace the mixer levels with the preset levels and keep the two representations in sync.
6. WHEN a session is running THE SYSTEM SHALL hide global navigation and the footer so the ritual is the only task on screen.

### Requirement 2: Keep time honestly

**User Story:** As a visitor, I want a timer that survives tab throttling and reloads, so that the vigil reflects real elapsed time rather than animation frames.

#### Acceptance Criteria

1. WHEN a running snapshot exists THE SYSTEM SHALL compute remaining seconds from an absolute `targetEnd` timestamp, never from a decrementing counter.
2. WHEN the visitor pauses THE SYSTEM SHALL store the remaining seconds, clear `targetEnd`, and freeze the display.
3. WHEN the visitor resumes THE SYSTEM SHALL recompute `targetEnd` from the stored remaining seconds and the current clock, with a floor of one second.
4. WHEN the page is hidden and later shown THE SYSTEM SHALL recalculate from the clock and immediately complete the session if the target has passed.
5. WHEN the browser is reloaded mid-vigil THE SYSTEM SHALL restore the snapshot, resume a running phase against its absolute target, and route directly to `/vigil`.
6. WHEN the snapshot is unreadable or structurally invalid THE SYSTEM SHALL discard it and present the setup screen instead of failing to boot.
7. WHEN the visitor releases early THE SYSTEM SHALL record focused seconds as elapsed time, capped at the planned duration, and mark the vigil as released rather than completed.
8. WHEN the planned duration elapses THE SYSTEM SHALL automatically finish the vigil once (idempotently), chime, and route to `/return`.
9. WHEN assistive technology is active THE SYSTEM SHALL expose the countdown through a `role="timer"` element with a pluralised `aria-label` and announce state changes through a polite live region without announcing every second.

### Requirement 3: Sound without files

**User Story:** As a visitor, I want generative ambience, so that the room feels alive without downloading audio assets or creating an account.

#### Acceptance Criteria

1. WHEN the ritual starts THE SYSTEM SHALL synthesise wind, rain, hearth, drone, and bells from Web Audio nodes; no audio files SHALL be fetched.
2. WHEN the visitor adjusts a channel THE SYSTEM SHALL apply the level smoothly rather than stepping abruptly.
3. WHEN the visitor changes the master volume or mutes THE SYSTEM SHALL apply it to the engine's master gain and persist the setting.
4. WHEN the document is hidden THE SYSTEM SHALL suspend audio output; WHEN it becomes visible again THE SYSTEM SHALL resume only if the session is still running and sound is enabled.
5. WHEN the browser blocks audio until a gesture THE SYSTEM SHALL start the engine on the first user gesture and surface no unhandled rejection.
6. WHEN the visitor finishes or releases a vigil THE SYSTEM SHALL play a short bell chime at the configured volume.

### Requirement 4: The return and the seal

**User Story:** As a visitor, I want the end of a vigil to feel like a small ceremony, so that the record I keep has meaning.

#### Acceptance Criteria

1. WHEN a vigil finishes THE SYSTEM SHALL route to `/return` and display the intention, duration kept, date, ambience, transmission, and sigil.
2. WHEN the vigil record is built THE SYSTEM SHALL compute the seal with the canonical string `vesper.seal.v1|id|startedAt|endedAt|plannedMin|focusedSec|completed|intention|ambience` and store its `keccak256`.
3. WHEN the transmission and sigil are generated THE SYSTEM SHALL derive them deterministically from the vigil seed such that the same vigil always produces the same text and geometry.
4. WHEN the visitor asks for the sigil THE SYSTEM SHALL copy or download an SVG that matches the on-screen geometry.
5. WHEN the visitor asks to download the record THE SYSTEM SHALL offer a JSON attestation containing the typed data and signature if one exists, otherwise a record-level JSON without claiming a signature.
6. WHEN multiple attestations are attached to one archive THE SYSTEM SHALL expose them per vigil, never as a single global signature.

### Requirement 5: The crypt

**User Story:** As a returning visitor, I want to see what I have kept, so that the ritual accumulates into something I care about.

#### Acceptance Criteria

1. WHEN the visitor opens `/crypt` with no records THE SYSTEM SHALL present an empty state with actions to begin a vigil, add sample vigils, export, or import.
2. WHEN records exist THE SYSTEM SHALL show focus kept (minutes), current streak (days), minutes kept today, and sealed-sigil count.
3. WHEN computing streaks THE SYSTEM SHALL count consecutive local calendar days with at least one qualifying vigil, ending today or yesterday.
4. WHEN displaying the last seven days THE SYSTEM SHALL show a labelled bar chart with accessible text values.
5. WHEN displaying the constellation THE SYSTEM SHALL place every vigil deterministically, mark samples distinctly, and allow keyboard selection of each star.
6. WHEN the visitor selects a vigil THE SYSTEM SHALL show its details, seal status, attestation badge, and actions to reopen the return screen, copy the seal, or download the record.
7. WHEN an archived vigil's fields no longer match its seal THE SYSTEM SHALL visibly mark it as altered and never claim it is verified.
8. WHEN the visitor deletes a vigil THE SYSTEM SHALL require confirmation and then remove only that record.

### Requirement 6: Local-first persistence

**User Story:** As a privacy-conscious visitor, I want everything kept on my device, so that nothing about my focus is uploaded.

#### Acceptance Criteria

1. WHEN the app writes state THE SYSTEM SHALL use only `localStorage` keys under the `vesper.` prefix.
2. WHEN the app reads persisted state THE SYSTEM SHALL validate every field, clamp numeric ranges, and drop malformed records instead of throwing.
3. WHEN the vault fails to parse THE SYSTEM SHALL preserve the raw value under a timestamped `.corrupt.` key, remove the bad key, and continue with a default vault.
4. WHEN storage is unavailable or full THE SYSTEM SHALL degrade gracefully and inform the visitor without losing the in-memory session.
5. WHEN the visitor exports THE SYSTEM SHALL produce a versioned archive (`app: "vesper"`, `version: 1`, `exportedAt`, `vigils`, `settings`).
6. WHEN the visitor imports THE SYSTEM SHALL reject invalid JSON, foreign apps, non-array vigils, oversized archives, and wholly unreadable records with specific messages; WHEN merging THE SYSTEM SHALL skip duplicate ids.
7. WHEN the visitor clears the archive THE SYSTEM SHALL require confirmation and report what was removed.

### Requirement 7: Settings and preferences

**User Story:** As a visitor, I want to tune the product to my senses, so that it is comfortable to use.

#### Acceptance Criteria

1. WHEN the visitor opens `/settings` THE SYSTEM SHALL present ambience defaults, sound level, reduced motion, wallet controls, and archive actions in labelled sections.
2. WHEN the visitor selects a default ambience THE SYSTEM SHALL use it for the next vigil and persist it.
3. WHEN the visitor enables reduced motion THE SYSTEM SHALL suppress decorative animation in the backdrop, candle, and constellation.
4. WHEN the visitor changes a preference THE SYSTEM SHALL apply it immediately and persist it without a save button.
5. WHEN the visitor adds samples THE SYSTEM SHALL mark them as samples and exclude nothing from scoring; removal of samples SHALL be one explicit action.

### Requirement 8: Installable and offline

**User Story:** As a visitor, I want Vesper to open without a network, so that the ritual works in a cabin, a tunnel, or a power cut.

#### Acceptance Criteria

1. WHEN the production build loads THE SYSTEM SHALL register a service worker scoped to the app base and succeed with a relative base path (`base: "./"`).
2. WHEN the service worker installs THE SYSTEM SHALL precache the shell and every hashed asset referenced by the built HTML, including fonts referenced from CSS.
3. WHEN the app is loaded offline THE SYSTEM SHALL serve the cached shell and hashed assets with no console errors and no missing fonts.
4. WHEN a navigation request is made THE SYSTEM SHALL prefer the network and fall back to the cached shell.
5. WHEN a new service-worker version activates THE SYSTEM SHALL delete older caches and claim clients.
6. WHEN the app is served over a subpath THE SYSTEM SHALL keep manifest `start_url` and `scope` relative to the deployment.
7. WHEN the visitor installs the app THE SYSTEM SHALL provide a name, short name, theme colour, maskable icon, and shortcuts to `/vigil` and `/crypt`.

### Requirement 9: Accessibility and presentation

**User Story:** As a visitor using a keyboard or screen reader, I want to complete the whole ritual, so that the product is not decorative-only.

#### Acceptance Criteria

1. WHEN the visitor uses a keyboard THE SYSTEM SHALL provide a visible focus indicator on every interactive element and a skip link that focuses `main` without changing the route.
2. WHEN a view renders THE SYSTEM SHALL expose exactly one `h1` and a logical heading order.
3. WHEN state changes (start, pause, resume, finish, copy, export, delete) THE SYSTEM SHALL announce a concise message through a polite live region.
4. WHEN the visitor prefers reduced motion THE SYSTEM SHALL honour both the stored setting and `prefers-reduced-motion`.
5. WHEN colour alone conveys state THE SYSTEM SHALL also provide text or shape so the state survives monochrome.
6. WHEN text is zoomed or the viewport is 320 px wide THE SYSTEM SHALL keep controls usable without horizontal scrolling.
7. WHEN plurals are displayed THE SYSTEM SHALL use singular forms for one unit (minute, day, vigil, sample).

### Requirement 10: Routing and resilience

**User Story:** As a visitor, I want links and reloads to behave predictably, so that I never lose my place.

#### Acceptance Criteria

1. WHEN the app boots THE SYSTEM SHALL parse hash routes (`#/`, `#/vigil`, `#/return`, `#/crypt`, `#/settings`) and render exactly one view.
2. WHEN an unknown hash is supplied THE SYSTEM SHALL render the landing view.
3. WHEN a view throws during render, THE SYSTEM SHALL show a contained error state with a way back, without unmounting the shell.
4. WHEN a ritual is active THE SYSTEM SHALL keep the ritual route authoritative over navigation changes.

### Requirement 11: Quality gates

**User Story:** As the maintainer, I want deterministic checks, so that the ceremony never regresses silently.

#### Acceptance Criteria

1. WHEN `npm run typecheck` runs THE SYSTEM SHALL pass with no TypeScript errors.
2. WHEN `npm test` runs THE SYSTEM SHALL execute unit tests for timer, stats, sealing, sigil, transmissions, storage, and attestations.
3. WHEN `npm run test:e2e` runs THE SYSTEM SHALL drive the golden path in Chromium against a preview build.
4. WHEN `npm run build` runs THE SYSTEM SHALL typecheck first and then emit a production bundle.
5. WHEN a public route is built THE SYSTEM SHALL contain no source maps or secrets.

## Non-Goals

- Accounts, sync, or any server-side storage.
- Social features, leaderboards, or sharing other than explicit file export.
- Audio file streaming; ambience is synthesised.
- Mobile native apps; the PWA is the mobile story.
