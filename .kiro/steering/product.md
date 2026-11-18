---
inclusion: always
---

# Product — Vesper

## What it is

Vesper is a haunted focus ritual. A visitor names one intention, chooses a length and a room of generative sound, keeps the vigil, and receives a poetic transmission plus a deterministic sigil. Finished vigils are archived locally as "proof of focus" that can be sealed with a wallet signature and, optionally, minted as a soulbound on-chain sigil.

## Who it is for

- People who want a focus timer with atmosphere rather than gamified productivity.
- Privacy-minded users: no accounts, no analytics, no uploads, no audio downloads.
- Web3-curious users who want a proof mechanism that is verifiable, not decorative — and who can ignore it entirely.

## Product pillars

1. **Ceremony, not productivity.** The ritual should feel like a small, deliberate act. Copy is quiet and literary; the UI stays out of the way while the timer runs.
2. **Honest proof.** Never claim a record is signed, verified, or sealed unless it is. Unsigned is a valid state, clearly labelled.
3. **Local-first.** Everything works offline and on-device. `localStorage` is the database; the network is optional.
4. **Accessible by default.** Keyboard operation, screen-reader labels, reduced motion, visible focus, 320 px support.
5. **Deterministic artifacts.** Same vigil → same seal, transmission, and sigil, forever.

## Voice and copy

- Second person, calm, concrete. "You kept the vigil for 25 minutes." Not "Great job!".
- Haunted but never gory; candlelight, drafts, bells, old houses.
- Units are always pluralised correctly: 1 minute / 2 minutes, 1 day / 2 days, 1 vigil / 2 vigils.
- Errors say what happened and what to do next. No stack traces, no blame.
- Never imply surveillance or upload. Use "this browser", "on this device".

## Success criteria

- A first-time visitor can begin and finish a vigil without instructions.
- A reload mid-vigil resumes the correct remaining time.
- The app loads and completes the ritual offline, with fonts and no console errors.
- An exported archive verifies independently with `npm run verify:attestation`.
- Lighthouse: no accessibility violations on the five routes; PWA installable.
- Kiroween submission requirements are met (see `kiroween-playbook`).

## Non-goals

Accounts, sync, leaderboards, social feeds, notification spam, native apps, streaming audio files, custodial wallets, token speculation.
