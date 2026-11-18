# Requirements Document

## Introduction

Vesper's sigils are only as meaningful as their proof. This specification defines a two-layer proof system:

1. **Wallet attestations (default, off-chain).** The keeper signs an EIP-712 `Vigil` message with the same fields the app archives. Anyone can recover the signer and recompute the seal without trusting Vesper's code.
2. **Soulbound registry (opt-in, on-chain).** A keeper may mint the signed vigil to an ERC-721 that can never be transferred. The contract verifies the same EIP-712 signature and stores the seal, duration, and start time.

The app must never imply that an unsigned local record is a proof. The contract is optional: an unconfigured build still offers full off-chain proof and an honest "on-chain not configured" state.

## Glossary

- **Keeper** — the wallet address that signs a vigil.
- **Injected wallet** — an EIP-1193 provider exposed by the browser.
- **Local keeper** — a key generated in the browser, stored only in `vesper.wallet.v1`.
- **Attestation** — stored EIP-712 domain, message, signature, address, chain id, and kind.
- **Seal** — `keccak256` of the canonical vigil record; included in the signed message.
- **Registry** — `VesperSigils`, the soulbound ERC-721 contract.
- **Typed data** — `Vigil(bytes32 id, address keeper, string startedAt, uint32 durationMin, bytes32 seal)` on domain `{ name: "Vesper", version: "1", chainId, verifyingContract? }`.

## Requirements

### Requirement 1 — Choose a keeper

**User Story:** As a visitor, I want a wallet choice that matches my setup, so that I can seal vigils without installing anything.

#### Acceptance Criteria

1. WHEN the visitor opens the wallet section THE SYSTEM SHALL offer "Browser wallet" only if an EIP-1193 provider is present, and always offer "Local keeper".
2. WHEN the visitor connects a browser wallet THE SYSTEM SHALL request accounts, validate a 20-byte address, read the chain id, and persist `{ kind: "injected", address, chainId }` with no private key.
3. WHEN the visitor creates a local keeper THE SYSTEM SHALL generate a private key with a cryptographically secure source, derive the address, and persist the key only in `localStorage`.
4. WHEN the visitor disconnects THE SYSTEM SHALL erase the stored keeper, including the local private key, and leave existing attestations untouched.
5. WHEN a browser wallet changes account or chain THE SYSTEM SHALL refresh the displayed keeper and refuse to sign until the chain matches the stored record.
6. WHEN the visitor is about to create a local keeper THE SYSTEM SHALL warn, in plain language, that the key lives in this browser and that clearing site data destroys the ability to sign again with that address.

### Requirement 2 — Sign the exact record

**User Story:** As a keeper, I want the signature to cover the vigil I actually kept, so that the proof cannot be reused for a different record.

#### Acceptance Criteria

1. WHEN a vigil is signed THE SYSTEM SHALL build typed data with `id = keccak256(utf8 vigil.id)`, `keeper`, `startedAt` as a decimal string, `durationMin` clamped to 1–600, and `seal` equal to the archived seal.
2. WHEN the domain includes `verifyingContract` THE SYSTEM SHALL use the configured registry address; otherwise THE SYSTEM SHALL omit the field entirely, never send `undefined`.
3. WHEN a local keeper signs THE SYSTEM SHALL use viem's `signTypedData` over the same object the verifier reconstructs.
4. WHEN an injected wallet signs THE SYSTEM SHALL send `eth_signTypedData_v4`, with the message fields in the same shape, and validate that the result is a 65-byte hex signature.
5. WHEN signing fails or the wallet refuses THE SYSTEM SHALL surface a human-readable error and leave the vigil unsigned rather than storing a placeholder.
6. WHEN the signature succeeds THE SYSTEM SHALL store the attestation on the vigil, including `kind`, `signedAt`, and the domain that was actually used.

### Requirement 3 — Verify without trusting the app

**User Story:** As a sceptic, I want to check a sigil independently, so that "proof of focus" is not an in-app assertion.

#### Acceptance Criteria

1. WHEN the app displays an attestation THE SYSTEM SHALL recover the signer from the typed data and signature and compare it to the declared keeper, case-insensitively.
2. WHEN verification fails for any reason THE SYSTEM SHALL show "unverified" and never a success state.
3. WHEN the visitor exports an attestation THE SYSTEM SHALL include enough data (domain, types-compatible message, signature, address) for an independent tool to recover the signer.
4. WHEN `npm run verify:attestation -- <file>` runs against an attestation or archive THE SYSTEM SHALL recover the signer, report pass/fail per vigil, recompute seals for archive records, and exit non-zero on any failure.
5. WHEN the CLI verifies a file THE SYSTEM SHALL reject malformed addresses, hashes, signatures, non-digit timestamps, and durations outside 1–600 before recovering.
6. WHEN the visitor inspects a vigil THE SYSTEM SHALL recompute the seal and flag records whose fields have changed since sealing.

### Requirement 4 — Honest unsigned state

**User Story:** As a visitor without a wallet, I want the rest of the product to work, so that proof is optional rather than a paywall.

#### Acceptance Criteria

1. WHEN no keeper exists THE SYSTEM SHALL complete the ritual, archive the vigil, and label it "unsigned", never "sealed".
2. WHEN the visitor signs a vigil later THE SYSTEM SHALL attach the attestation to the existing record without changing the seal.
3. WHEN the visitor declines signing THE SYSTEM SHALL proceed to the crypt with no modal trap and no repeated prompt during the same visit.
4. WHEN the crypt counts "sealed sigils" THE SYSTEM SHALL count only records with a stored attestation and SHALL label each one verified only after signer recovery succeeds.

### Requirement 5 — Mint a soulbound sigil

**User Story:** As a keeper with a wallet, I want to mint my proof on-chain, so that the record outlives this browser.

#### Acceptance Criteria

1. WHEN the visitor requests a mint THE SYSTEM SHALL require a signed attestation, a configured registry address, and a wallet that can send transactions.
2. WHEN the mint transaction is prepared THE SYSTEM SHALL call `mint(Vigil vigil, bytes signature)` with the exact signed message fields.
3. WHEN the transaction confirms THE SYSTEM SHALL store `{ txHash, chainId, contract }` on the vigil and display the token id or a block-explorer link.
4. WHEN the registry is unconfigured THE SYSTEM SHALL show an informative disabled state with the deployment instructions, not an error toast.
5. WHEN the contract reverts THE SYSTEM SHALL surface the custom error (AlreadySealed, KeeperMismatch, InvalidSeal, InvalidDuration, InvalidStartedAt, Soulbound) in human terms.
6. WHEN the visitor has already minted a vigil THE SYSTEM SHALL show the existing on-chain receipt and not offer a duplicate mint.

### Requirement 6 — Registry invariants

**User Story:** As the protocol author, I want the contract to enforce the proof rules, so that a malicious client cannot mint junk.

#### Acceptance Criteria

1. WHEN `mint` is called THE SYSTEM SHALL revert with `KeeperMismatch` unless `vigil.keeper == msg.sender`.
2. WHEN `mint` is called twice for one `sigilId` THE SYSTEM SHALL revert with `AlreadySealed(sigilId)`.
3. WHEN the seal is zero, the duration is outside 1–600, or `startedAt` is not 1–20 ASCII digits THE SYSTEM SHALL revert with the matching custom error.
4. WHEN the EIP-712 digest is recovered THE SYSTEM SHALL revert with `KeeperMismatch` unless the signer equals `vigil.keeper`.
5. WHEN a mint succeeds THE SYSTEM SHALL increment `totalSupply`, record `sealOf`, `durationOf`, `startedAtOf`, `tokenOfSigil`, and emit `SigilSealed(tokenId, sigilId, keeper, seal)`.
6. WHEN `locked(tokenId)` is called for an existing token THE SYSTEM SHALL return `true` (ERC-5192); for an unknown token THE SYSTEM SHALL revert with `UnknownToken(tokenId)`.
7. WHEN any transfer, `approve`, or `setApprovalForAll` is attempted THE SYSTEM SHALL revert with `Soulbound()`; minting and burning semantics SHALL keep the token non-transferable for its lifetime.
8. WHEN `tokenURI` is read THE SYSTEM SHALL return a base64 JSON data URI containing name, description, attributes (Seal, Duration, Started, Soulbound), and an inline SVG image.
9. WHEN the contract is deployed THE SYSTEM SHALL bind the EIP-712 domain to `("Vesper", "1")` and the deployment chain id, so signatures cannot replay across chains or contracts.

### Requirement 7 — Chain configuration

**User Story:** As a deployer, I want explicit configuration, so that the app never silently talks to the wrong chain.

#### Acceptance Criteria

1. WHEN `VITE_SIGIL_CONTRACT` is absent or malformed THE SYSTEM SHALL treat on-chain features as unconfigured.
2. WHEN `VITE_CHAIN_ID` is set THE SYSTEM SHALL use it for the local keeper's domain chain id; otherwise THE SYSTEM SHALL default to Base (8453).
3. WHEN the keeper's chain differs from the configured chain THE SYSTEM SHALL block minting with an actionable message.
4. WHEN contracts are deployed THE SYSTEM SHALL use Hardhat Ignition modules with RPC URLs and the deployer key supplied only through environment variables.

### Requirement 8 — Key and secret hygiene

**User Story:** As a security reviewer, I want clear boundaries, so that this hackathon build does not become a wallet drainer.

#### Acceptance Criteria

1. WHEN the repository is inspected THE SYSTEM SHALL contain no private keys, mnemonics, RPC secrets, or API keys; `.env.example` SHALL contain only zero placeholders.
2. WHEN the app signs THE SYSTEM SHALL never request a seed phrase, never request `eth_sign`, and never send any data to a network endpoint.
3. WHEN a local keeper exists THE SYSTEM SHALL display the address and kind but SHALL NOT display the private key again after creation.
4. WHEN the visitor exports the vault THE SYSTEM SHALL exclude `vesper.wallet.v1`; exported archives SHALL contain attestations but never keys.
5. WHEN contracts are built for production THE SYSTEM SHALL enable the optimizer (runs 200) and pin the compiler version.

## Non-Goals

- Custody, recovery, or account abstraction.
- Cross-chain bridging or indexing services.
- Marketplace royalties or transferability; the token is intentionally inert.
- An audit claim. The contract ships with tests and documentation, not a security guarantee.
