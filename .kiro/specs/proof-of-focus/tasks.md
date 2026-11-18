# Implementation Plan

## Task 1 — Typed data and seal

- [x] 1.1 Define `VIGIL_TYPES` with `id`, `keeper`, `startedAt` (string), `durationMin`, `seal`. (Req 2.1)
- [x] 1.2 Implement `messageId`, `buildSeal`, `verifySeal`, and `buildTypedData` with an optional `verifyingContract`. (Req 2.2, 3.6)
- [x] 1.3 Keep `startedAt` a decimal string end-to-end so the app and the contract sign identical bytes. (Req 2.1, 2.4)

## Task 2 — Wallet layer

- [x] 2.1 Detect EIP-1193 providers and connect with address and chain validation. (Req 1.1, 1.2)
- [x] 2.2 Implement local keeper generation with secure randomness and localStorage persistence. (Req 1.3, 1.5)
- [x] 2.3 Warn before local creation, hide the key afterwards, and erase it on disconnect/export. (Req 1.4, 1.6, 8.3, 8.4)
- [x] 2.4 Watch `accountsChanged` and `chainChanged` and refresh the record. (Req 1.5)

## Task 3 — Signing

- [x] 3.1 Implement `signVigil` for local keepers via `signTypedData`. (Req 2.3)
- [x] 3.2 Implement injected signing via `eth_signTypedData_v4` with signature validation and chain check. (Req 2.4, 7.3)
- [x] 3.3 Persist the attestation on the vigil only after a successful signature. (Req 2.5, 2.6)
- [x] 3.4 Surface wallet rejection and unusable signatures as actionable errors. (Req 2.5)

## Task 4 — In-app verification

- [x] 4.1 Implement `verifyAttestation` with structural checks and signer recovery. (Req 3.1, 3.2)
- [x] 4.2 Render signed/verified, signed/unverifiable, and unsigned states on the return screen and crypt. (Req 4.1, 4.2)
- [x] 4.3 Show the per-vigil seal check independently of the signature. (Req 3.6)
- [x] 4.4 Count only attestation-bearing records as "sealed" and never call an unsigned record proven. (Req 4.1, 4.4)

## Task 5 — Export and independent verifier

- [x] 5.1 Include domain, message, signature, address, kind, and signedAt in attestation downloads. (Req 3.3)
- [x] 5.2 Implement `scripts/verify-attestation.ts` for single attestations and archives. (Req 3.4)
- [x] 5.3 Add field validation and non-zero exit codes; print per-vigil signature and seal results. (Req 3.5)
- [x] 5.4 Verify a generated archive with the CLI and confirm a tampered record fails. (Req 3.4–3.6)

## Task 6 — Soulbound registry

- [x] 6.1 Implement the EIP-712 `Vigil` struct, typehash, and domain in Solidity. (Req 6.9)
- [x] 6.2 Implement `mint` with duplicate, keeper, seal, duration, timestamp, and signature checks. (Req 6.1–6.4)
- [x] 6.3 Record seal/duration/start and mint-once lookups; emit `SigilSealed`. (Req 6.5)
- [x] 6.4 Override `approve`, `setApprovalForAll`, and `_update` to enforce soulbinding. (Req 6.7)
- [x] 6.5 Implement `locked` (ERC-5192) with `UnknownToken`. (Req 6.6)
- [x] 6.6 Implement `tokenURI` with base64 JSON, attributes, and inline SVG. (Req 6.8)

## Task 7 — Contract tests and tooling

- [x] 7.1 Configure Hardhat 3 + toolbox-viem with Base, Base Sepolia, and Sepolia networks. (Req 7.4)
- [x] 7.2 Write nine node:test cases covering the happy path, every revert, soulbound behaviour, and metadata. (Req 6.1–6.9)
- [x] 7.3 Add an Ignition module and a deploy script that prints frontend configuration. (Req 7.4)
- [x] 7.4 Add `.env.example` with zero placeholders and document deployment and verification. (Req 8.1)
- [x] 7.5 Pass `hardhat build`, `tsc --noEmit`, and the full contract test suite. (Req 6.1–6.9)

## Task 8 — Optional mint flow

- [x] 8.1 Gate minting on an attestation, a configured contract, and an injected wallet on the configured chain. (Req 5.1, 7.1)
- [x] 8.2 Call `mint` with the exact signed struct and store the receipt on success. (Req 5.2, 5.3)
- [x] 8.3 Disable mint with an explanatory state when unconfigured. (Req 5.4)
- [x] 8.4 Map custom errors to human-readable messages. (Req 5.5)
- [x] 8.5 Prevent duplicate mints and show the existing receipt. (Req 5.6)

## Task 9 — Configuration and hygiene

- [x] 9.1 Read `VITE_SIGIL_CONTRACT`, `VITE_CHAIN_ID`, and `VITE_REPO_URL` with safe defaults. (Req 7.1, 7.2)
- [x] 9.2 Ensure no secrets exist in the repository and `.env` files are ignored. (Req 8.1)
- [x] 9.3 Confirm exports contain attestations but never wallet keys. (Req 8.4)
- [ ] 9.4 Deploy the registry to Base Sepolia and set the production `VITE_SIGIL_CONTRACT`/`VITE_CHAIN_ID`. (Req 5.1, 7.4)
