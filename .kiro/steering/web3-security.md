---
inclusion: fileMatch
fileMatchPattern: ["src/lib/attestation.ts", "src/lib/wallet.ts", "src/lib/storage.ts", "scripts/verify-attestation.ts", "contracts/**/*.sol", "contracts/**/*.ts"]
---

# Web3 Security — Vesper

## Non-negotiable invariants

1. **One typed-data shape.** `Vigil(bytes32 id, address keeper, string startedAt, uint32 durationMin, bytes32 seal)` on domain `("Vesper", "1")`. The app, the CLI verifier, and the contract must encode identical bytes.
2. **`startedAt` is a decimal string.** Never sign a number and send a string. Validate `/^\d+$/`.
3. **`seal` covers the record.** Canonical string:
   `vesper.seal.v1|<id>|<startedAt>|<endedAt>|<plannedMin>|<focusedSec>|<completed|released>|<intention>|<ambience>`, hashed with `keccak256(utf8)`.
4. **`id` in the signature is `keccak256(utf8(vigil.id))`.** The raw UUID is never signed.
5. **`durationMin` is clamped to 1–600** before signing and re-validated on-chain and in the verifier.
6. **`keeper == signer`,** compared case-insensitively, everywhere.
7. **Domain binding.** Include `verifyingContract` only when a registry is configured; omit the property entirely otherwise. Never send `undefined`.
8. **Soulbound forever.** No transfers, approvals, burn, admin, upgrade, or rescue paths. Do not add them for convenience.
9. **Mint verifies twice.** `msg.sender == keeper` and `ECDSA.recover(digest, signature) == keeper`.
10. **Mint-once per sigil id.** Check before state changes; revert `AlreadySealed`.

## Key handling

- The local keeper's private key exists only in memory and `vesper.wallet.v1`.
- Never log, render, export, or transmit the key. It is excluded from archive exports.
- Disconnect erases the key. Warn before creation; after creation show only the address.
- Never ask for a seed phrase, extended key, or `eth_sign`.
- Never add remote signing, custodial endpoints, or "recover my wallet" flows.

## Contract review checklist

Before changing `.sol` or its tests:

- [ ] EIP-712 typehash string matches the struct field order exactly.
- [ ] Domain constructor still `("Vesper", "1")`.
- [ ] Reverts use named custom errors; tests assert each one.
- [ ] `approve`, `setApprovalForAll`, and every `_update` transfer path still revert `Soulbound()`.
- [ ] `locked()` reverts `UnknownToken` for unminted ids and returns `true` otherwise.
- [ ] `tokenURI` remains self-contained (base64 JSON + inline SVG), no external URLs.
- [ ] No `delegatecall`, `selfdestruct`, upgrade proxy, or owner-only functions.
- [ ] `npx hardhat build`, `npx tsc --noEmit`, and `npm test` pass in `contracts/`.

## Client review checklist

- [ ] Signing only occurs after explicit user action; no silent prompt on load or finish.
- [ ] A rejected signature leaves the vigil unsigned with an actionable message.
- [ ] The UI never shows "verified" before recovery returns the keeper.
- [ ] Seal tampering is detected independently of signature validity.
- [ ] Mint is disabled when the registry is unconfigured, the wallet is local, or the chain differs.
- [ ] `npm run verify:attestation` accepts a fresh export and rejects a tampered one.
- [ ] No secret, RPC URL, or key appears in source, fixtures, screenshots, or docs.

## Threat model reminders

- A compromised frontend can lie, but cannot forge a signature; keep the CLI verifier independent (no imports from `src`).
- A replay on another chain is prevented by the domain chain id; a replay against another registry is prevented by `verifyingContract` when configured.
- A stolen local keeper can sign fake vigils but holds no funds; keep its scope that narrow.
- Do not add features that convert this registry into a marketplace or a claim on value.

## When in doubt

Prefer refusing a feature over weakening an invariant. If a requirement seems to need a transferable token, it belongs to a different product.
