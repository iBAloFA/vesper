---
inclusion: fileMatch
fileMatchPattern: ["src/lib/attestation.ts", "src/lib/wallet.ts", "src/lib/storage.ts", "src/lib/proof/**", "scripts/verify-attestation.ts", "scripts/verify-solana.ts", "contracts/**/*.sol", "contracts/**/*.ts"]
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

## Solana v0.2 invariants

1. **One canonical message.** `vesper.vigil.v2` with the fixed field order in
   `src/lib/proof/canonical.ts`. LF, no trailing newline, `startedAt` digit-only, `program=unminted`
   when unconfigured, `clockDriftMs=unknown` when unrecorded. Sign those exact bytes.
2. **Seal v2 is SHA-256, not keccak.** `sha256("vesper.seal.v2|sigil|startedAt|endedAt|plannedMin|focusedSec|outcome|intention|ambience|drift")`,
   lowercase hex. The sigil id is `sha256("vesper.sigil.v2|" + vigil.id)`.
3. **Ed25519 means the keeper.** The verifier rebuilds the message and refuses anything that does not
   round-trip. A signature only counts against the `keeper` named in the message.
4. **`tweetnacl` is CommonJS.** Use the default import; `import * as nacl` loses `sign` under Node ESM.
5. **The keystore is ciphertext only.** PBKDF2-SHA256 ≥ 600,000 iterations, 16-byte salt,
   AES-256-GCM, 12-byte IV, at `vesper.keeper.v2`. The passphrase and the secret are never stored or
   logged. Forge must read back and decrypt before returning a keeper.
6. **Lock hard.** The unlocked keeper lives in memory only; reload locks it, and 15 minutes without
   pointer or key activity locks it.
7. **Wallet signatures are checked before use.** Verify `solana:signMessage` output against the
   account's own public key; a mismatch or rejection leaves the vigil unsealed with a calm message.
8. **Account layouts are a contract.** `Sigil` is 217 bytes and `Ledger` 49 bytes as mirrored in
   `scripts/verify-solana.ts`; discriminators are `sha256("account:<Name>")[0..8]`. Do not reorder.
9. **The ledger is chained and keeper-bound.** `prev` is the hash of the previous line, genesis is 64
   zeros, sequence is consecutive, an entry counts only for the attestation's keeper, and a release
   is described as a signed notice, never as proof.
10. **No admin, no transfer, no burn, no upgrade.** Token-2022 NonTransferable, mint authority
    revoked, no freeze authority, upgrade authority set to none after a passing deploy.

## Key handling

- The v0.1 local keeper's private key exists only in memory and `vesper.wallet.v1`.
- The v0.2 keeper's 64-byte Ed25519 secret exists only in memory and as ciphertext at
  `vesper.keeper.v2`.
- Never log, render, export, or transmit either secret. They are excluded from archive exports.
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
- [ ] A v2 attestation is re-verified in-app before it is stored or offered for download.
- [ ] The wallet module stays behind a dynamic import; the base bundle does not carry it.
- [ ] Every record labels its proof target (`evm · <chainId>` or `solana · <cluster>`).
- [ ] `npm run verify:attestation` accepts a fresh export and rejects a tampered one.
- [ ] No secret, RPC URL, or key appears in source, fixtures, screenshots, or docs.

## Threat model reminders

- A compromised frontend can lie, but cannot forge a signature; keep the CLI verifier independent
  (it may import `src/lib/proof/ledger.ts` only, as protocol code with no storage or React).
- A replay on another chain is prevented by the domain chain id; a replay against another registry is prevented by `verifyingContract` when configured.
- In v0.2 the cluster and program are signed labels, not an on-chain check. Only `--rpc` reads the PDAs.
- A stolen local keeper can sign fake vigils but holds no funds; keep its scope that narrow.
- A release that is not in the ledger is invisible to an offline verifier; the program flag and the
  anchored head are the escape hatches, and neither exists until the program does.
- Do not add features that convert this registry into a marketplace or a claim on value.

## When in doubt

Prefer refusing a feature over weakening an invariant. If a requirement seems to need a transferable token, it belongs to a different product.
