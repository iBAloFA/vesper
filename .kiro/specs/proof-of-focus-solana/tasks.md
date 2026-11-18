# Tasks — Proof of Focus, Solana

## Overview

This plan moves the proof layer to Solana in stages: toolchain, pure TypeScript core, program, client wiring, deployment, then documentation. The TypeScript core is testable on Windows today; the program requires the WSL2 toolchain from Task 0. Nothing lands on `main` until the Kiroween entry is submitted.

## Tasks

- [ ] 0. Toolchain and devnet wallet (operator) (Req 7)
  - [ ] 0.1 Install WSL2 Ubuntu, Rust, Solana CLI, Anchor via `avm`, and a devnet keypair per the design.
  - [ ] 0.2 Clone the branch inside the WSL filesystem and confirm `anchor --version` and `solana cluster-version`.
  - [ ] 0.3 Request a devnet airdrop and record the keypair path outside the repository.

- [ ] 1. Canonical message and seal v2 (Req 1)
  - [x] 1.1 Implement `buildMessageV2` and `computeSealV2` as pure functions with fixed field order and digit-only `startedAt`.
  - [x] 1.2 Keep `computeSeal` (v1) untouched; add tests proving old records still verify.
  - [x] 1.3 Test determinism across locales, field order, and altered-field detection.

- [ ] 2. Encrypted keystore (Req 2)
  - [x] 2.1 Implement WebCrypto PBKDF2-SHA256 + AES-256-GCM wrap/unwrap for the 64-byte Ed25519 secret.
  - [x] 2.2 Fail closed on wrong passphrase and on tampered ciphertext; test both.
  - [x] 2.3 Implement idle auto-lock and lock-on-reload; never persist the unlocked key.
  - [x] 2.4 Implement v1 plaintext migration with a re-read check before deleting the old key.

- [ ] 3. Local keeper (Req 2.1, 3.2)
  - [x] 3.1 Generate Ed25519 keypairs with `tweetnacl` and derive the base58 address.
  - [x] 3.2 Sign a message and verify it locally before any attestation is offered.
  - [x] 3.3 Add tests for round trip, wrong key, and truncated signature.

- [ ] 4. Wallet signing (Req 3)
  - [ ] 4.1 Add wallet-standard support and a lazy-loaded connect control so the base bundle does not grow.
  - [ ] 4.2 Verify `signMessage` output against the wallet public key; handle rejection without unhandled errors.
  - [ ] 4.3 Surface a clear unsealed state when the wallet key differs from the recorded keeper.

- [ ] 5. Clock evidence (Req 6)
  - [ ] 5.1 Implement drift sampling across begin, pause, resume, visibility change, and finish.
  - [x] 5.2 Record `clockDriftMs`; exceed 2,000 ms ⇒ "clock moved" label, sealing still allowed.
  - [ ] 5.3 Show the evidence on the return view and in the crypt; never describe it as proof of time.
  - [x] 5.4 Unit-test drift maths with injected clocks, including sleep-like jumps.

- [ ] 6. Attestation v2 and storage (Req 1, 9)
  - [x] 6.1 Assemble the v2 attestation JSON and add optional v2 fields to the vigil type without changing the vault version.
  - [x] 6.2 Include v1 and v2 attestations in one export; import both unchanged.
  - [ ] 6.3 Verify a v2 attestation in-app after sealing, before offering to download or mint.

- [ ] 7. Verifier (Req 5)
  - [x] 7.1 Route by version: v1 through the existing EIP-712 path, v2 through `tweetnacl`.
  - [x] 7.2 Recompute the seal and print explicit "proves / does not prove" lines.
  - [x] 7.3 Add `--rpc <url>` to report minted, keeper and revoked state from the PDA.
  - [x] 7.4 Add fixtures for valid, tampered, wrong-keeper, and unknown-version files.

- [ ] 8. Program scaffold (Req 4.1)
  - [ ] 8.1 Add `solana/` with Anchor config, workspace, and a CI-friendly build script.
  - [ ] 8.2 Define the `Sigil` and `Art` accounts exactly as designed, with layout checks.

- [ ] 9. Signature check in the program (Req 4.5)
  - [ ] 9.1 Parse the instructions sysvar and require an Ed25519 verify instruction immediately before `mint`.
  - [ ] 9.2 Bind message, keeper and signature; reject missing, reordered, or mismatched instructions.
  - [ ] 9.3 Test each rejection path.

- [ ] 10. Mint (Req 4.2–4.4)
  - [ ] 10.1 Initialise the `Sigil` PDA once and write the record fields.
  - [ ] 10.2 Create the Token-2022 mint with NonTransferable, metadata pointer and metadata; mint one; revoke mint authority.
  - [ ] 10.3 Store the SVG on the `Art` PDA and compare `art_hash`.
  - [ ] 10.4 Reject durations outside 1–600 and malformed accounts.

- [ ] 11. Revocation (Req 4.7)
  - [ ] 11.1 Add `revoke` requiring the keeper signature; set the flag, never burn or close.
  - [ ] 11.2 Report revoked state in the verifier and in the app.

- [ ] 12. Program tests (Req 8.2)
  - [ ] 12.1 Cover mint-once, soulbound transfer rejection, revocation, bad signature, and bounds.
  - [ ] 12.2 Run the suite in CI for `solana/**` changes.

- [ ] 13. Client mint flow (Req 7)
  - [ ] 13.1 Build the Ed25519 verify instruction and the `mint` transaction from the sealed record.
  - [ ] 13.2 Refuse to mint when the wallet cluster differs from configuration; explain the mismatch.
  - [ ] 13.3 Handle simulation failure with plain language and no partial state in the vault.

- [ ] 14. UI states and copy (Req 3, 6.4, 9.2)
  - [ ] 14.1 Rebuild the seal panel for Solana: passphrase unlock, wallet option, cluster chip.
  - [ ] 14.2 Show chain per record so v1 and v2 never blur together.
  - [ ] 14.3 Keep the keyboard path, live regions and reduced-motion behaviour intact.

- [ ] 15. Devnet deployment (Req 7.1)
  - [ ] 15.1 Deploy, verify with `solana program show`, and set the upgrade authority to none.
  - [ ] 15.2 Set `VITE_VESPER_PROGRAM` and `VITE_SOLANA_CLUSTER` for the build; exercise a real mint end to end.

- [ ] 16. Documentation (Req 10)
  - [ ] 16.1 Write `docs/solana-design.md` (message format, accounts, threat model, deployment).
  - [ ] 16.2 Update README limitations truthfully: unaudited until audited; revocation is a notice; time is evidenced, not proven.
  - [ ] 16.3 Update `.kiro/steering/web3-security.md` for Ed25519, PDAs and Token-2022.

- [ ] 17. Gates (Req 8)
  - [ ] 17.1 Typecheck, unit, e2e and offline suites, build.
  - [ ] 17.2 Contract gates for the untouched EVM code remain green.
  - [ ] 17.3 Bundle-size check: the wallet code stays lazy.

- [ ] 18. Audit preparation (Req 10)
  - [ ] 18.1 Write the invariant list and the attack surface summary for an external reviewer.
  - [ ] 18.2 Commission the audit before any mainnet deployment; keep the unaudited label until it completes.

## Dependencies

- Task 0 blocks Tasks 8–12 and 15.
- Tasks 1–3 block Tasks 6, 7 and 13.
- Task 10 blocks Tasks 11–15.
- Task 17 runs after every task that changes code.

## Notes

- Devnet can be reset by its operators; a reset wipes the program and sigils. This is acceptable for v0.2 and will be stated in the docs.
- v0.1 EVM contracts are frozen, not deleted; they remain the verification path for v1 records.
- The 37-second demo and the live v0.1 app stay untouched while this branch is developed.
