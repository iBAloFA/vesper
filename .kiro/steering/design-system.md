---
inclusion: fileMatch
fileMatchPattern: ["src/**/*.tsx", "src/**/*.ts", "src/styles/**/*.css"]
---

# Design System — Vesper

## Mood

Candlelit Victorian ghost story, rendered with restraint. Dark surfaces, warm ember accents, muted lavender for the uncanny, generous negative space. Nothing neon, nothing playful, no emoji.

## Tokens

Defined as CSS custom properties in `src/styles/app.css`:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#07060b` | Page background |
| `--ink-soft` | `#0e0c15` | Raised surface |
| `--parchment` | `#e9e2d0` | Primary text |
| `--parchment-dim` | `#a09aab` | Secondary text |
| `--ember` | `#e08a4b` | Primary accent, flame, active state |
| `--ember-soft` | `#ffe2b5` | Highlight/hover |
| `--violet` | `#8a7fbd` | Uncanny accent, constellation |
| `--line` | `rgba(233,226,208,.12)` | Borders |

Use tokens; do not hard-code hex values in new CSS. Semantic colours (success, danger) must remain distinguishable without colour alone.

## Typography

- Display: Cinzel (via `@fontsource/cinzel`) for headings and the wordmark.
- Body: Cormorant Garamond for narrative copy.
- UI/data: Inter for labels, buttons, numbers.
- One `h1` per view. Heading order is semantic; visual size is not the source of truth.
- Numerals in timers and stats use tabular figures where available.

## Layout

- Max content width ~1120 px, centred, with page gutters that never go below 20 px.
- Surfaces use a subtle border, dark translucent fill, and 18–24 px radius.
- Settings uses a two-column grid on desktop, one column ≤ 760 px.
- Stat cards: 4-up desktop, 2×2 at ≤ 420 px. Never a single orphan card.
- Tap targets ≥ 44 px; spacing scale in 4 px increments.

## Components

- `.btn` variants: `--primary` (ember fill), `--ghost` (outline), `--quiet` (text), `--wide`.
- `.chip` for presets and filters; active state uses `aria-pressed`.
- `.surface` for cards and panels; `.stat`, `.stat__value`, `.stat__label`, `.stat__foot`.
- `.tag` for metadata (sealed/sample/on-chain); pluralise text, never rely on colour alone.
- `.toast` queue is bounded; announcements go through a polite live region.
- `.skip-link` focuses `main` without changing the hash.

## Motion

- Ambient motion is slow (6–20 s), low-amplitude, and never blocks interaction.
- Reduced motion: honour both the stored setting and `prefers-reduced-motion`; remove drift/parallax, keep opacity fades short.
- No animation may delay a state change the user requested; the UI updates first, decoration follows.

## Accessibility rules

1. Visible `:focus-visible` ring on every interactive element; never `outline: none` without a replacement.
2. Every icon-only control has an `aria-label`; decorative SVG is `aria-hidden`.
3. State changes use text, not colour alone.
4. Live regions: one polite region for status, `role="timer"` for the countdown, no per-second announcements.
5. Contrast: body text ≥ 4.5:1 against its surface; large display text ≥ 3:1.
6. Works at 320 px width and 200% zoom without horizontal scrolling.
7. Dialogs trap focus, close on Escape, and return focus to the trigger.
8. Pluralise units in UI and screen-reader strings (`1 minute`, `2 minutes`).

## Copy patterns

- Buttons: verbs, sentence case — "Begin the vigil", "Seal this vigil", "Download record".
- Empty states: acknowledge, then offer one clear action.
- Errors: what happened + next step, no blame, no jargon.
- Time: `25:00`, `25 minutes`; dates via `lib/time.ts` helpers, never ad-hoc formatting.
