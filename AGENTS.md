# Vesper — agent instructions

Vesper is a haunted focus ritual: a local-first React PWA with generative ambience, deterministic sigils, and optional wallet-verifiable proof. Read `.kiro/steering/product.md`, `tech.md`, and `structure.md` before changing behaviour. The specs in `.kiro/specs/` are the source of truth for the ritual and the proof system.

## Gates

- App: `npm run typecheck`, `npm test`, `npm run build`.
- Contracts: in `contracts/`, `npx tsc --noEmit` and `npm test` (Hardhat 3, node:test).
- UI changes must be exercised in a browser; typechecks are not feature tests.
- After asset/font changes, verify an offline reload against `npm run preview`.

## Rules

1. No backend, analytics, uploads, or accounts. `localStorage` is the database.
2. Timer truth is the absolute `targetEnd` timestamp; never decrement a counter.
3. Never label a vigil signed, sealed, or verified unless the signature recovers to the keeper and the seal matches.
4. `startedAt` is a decimal string in EIP-712 and on-chain; duration is clamped to 1–600.
5. Secrets never enter the repo. `.env` files are ignored; `.env.example` holds placeholders only.
6. Do not push, create repositories, enable Pages, deploy contracts, tag releases, or post externally without explicit user approval.
7. Never fabricate Kiro screenshots or session logs; evidence must come from the human.
8. Keep copy calm and literary; pluralise units; honour reduced motion; keep the keyboard path complete.

## Contracts

See `contracts/AGENTS.md` for the Hardhat workflow. The registry is soulbound by design: no transfers, approvals, burn, admin, or upgrade paths.
