# Requirements — Proof of Focus, Solana

## Introduction

Version 0.2 moves Vesper's proof layer from EVM (EIP-712 signatures and an ERC-721 registry on Base) to Solana: Ed25519 signatures over a canonical message, and a soulbound Token-2022 sigil minted by an ownerless Anchor program. The work targets devnet first. It exists to remove the plaintext-key limitation, to replace vague clock claims with recorded evidence, and to deploy a real registry — while keeping v0.1 attestations verifiable and never claiming more than the cryptography proves.

## Requirements

### Requirement 1: Canonical v2 message

1. WHEN a vigil is sealed THE SYSTEM SHALL construct a deterministic UTF-8 message and sign those exact bytes.
2. The message SHALL contain, in fixed order: the literal header `vesper.vigil.v2`, cluster, program id, sigil id, keeper, `startedAt`, `durationMin`, `focusedSec`, outcome, clock drift, and seal.
3. `startedAt` SHALL remain a digit-only decimal string and SHALL never be parsed into a local `Date` inside the signed payload.
4. `durationMin` SHALL be an integer from 1 to 600.
5. THE SYSTEM SHALL compute the seal as SHA-256 over the canonical record string prefixed `vesper.seal.v2`, and SHALL store it as lowercase hex.
6. WHEN any covered field changes after sealing THE SYSTEM SHALL report the record as altered and SHALL NOT report it as verified.
7. THE SYSTEM SHALL keep v1 (EVM) seals and attestations verifiable through the existing path.

### Requirement 2: Encrypted local keeper

1. THE SYSTEM SHALL generate an Ed25519 keypair entirely on the device.
2. THE SYSTEM SHALL store the secret key only as ciphertext produced by PBKDF2-SHA256 (at least 600,000 iterations, 16-byte salt) and AES-256-GCM (12-byte IV), keyed by a passphrase the visitor supplies.
3. WHEN the wrong passphrase is entered THE SYSTEM SHALL fail closed, reveal nothing about the key, and offer no partial unlock.
4. THE SYSTEM SHALL lock the keeper after 15 minutes of inactivity and on every reload.
5. WHEN a v1 plaintext key exists THE SYSTEM SHALL offer to encrypt it, and SHALL delete the plaintext only after the encrypted keystore is written and re-read successfully.
6. THE SYSTEM SHALL never log, display, or export the secret key; exports contain the encrypted keystore only.
7. WHEN the passphrase is lost THE SYSTEM SHALL explain that sealed records remain verifiable but the keeper cannot sign again.

### Requirement 3: Wallet signing

1. THE SYSTEM SHALL support wallet-standard `signMessage` from an injected Solana wallet.
2. WHEN a wallet returns a signature THE SYSTEM SHALL verify it against the wallet's public key before offering to mint.
3. WHEN the visitor rejects the request THE SYSTEM SHALL return to the unsealed state with a calm message and no unhandled rejection.
4. WHEN the wallet's public key differs from the recorded keeper THE SYSTEM SHALL report the attestation as unverifiable.

### Requirement 4: Soulbound registry

1. THE SYSTEM SHALL provide an Anchor program with no admin instruction, no owner, and no upgrade authority after finalisation.
2. THE SYSTEM SHALL store each sigil in a PDA derived from its 32-byte sigil id; a second mint for the same id SHALL fail.
3. THE SYSTEM SHALL mint a Token-2022 token with zero decimals, supply one, and the NonTransferable extension, and SHALL revoke the mint authority after minting; there SHALL be no freeze authority.
4. THE SYSTEM SHALL store on the sigil account: keeper, seal, message hash, duration, focused seconds, outcome, minted-at, revoked flag, and the artwork hash; the SVG itself SHALL be stored on a companion art account.
5. THE SYSTEM SHALL verify the Ed25519 signature from the instructions sysvar and reject a missing, mismatched, or malformed verification instruction.
6. THE SYSTEM SHALL reject durations outside 1–600 and any account whose data fails the layout checks.
7. WHEN the keeper signs a revocation THE SYSTEM SHALL set the revoked flag; there SHALL be no burn or transfer instruction, and the verifier SHALL report a revoked sigil as revoked.
8. THE SYSTEM SHALL record each revocation as one keeper-signed, hash-chained entry appended to a static ledger, and SHALL anchor the new ledger head in a `Ledger` PDA, rejecting a sequence or previous head that does not follow the program's state.

### Requirement 5: Independent verifier

1. The CLI verifier SHALL import only `tweetnacl`, `bs58`, and `@solana/web3.js` and SHALL NOT import application code.
2. The verifier SHALL recompute the seal, verify the Ed25519 signature, and report the cluster named in the attestation.
3. WHEN given `--rpc <url>` THE SYSTEM SHALL report whether the sigil is minted, its keeper, and whether it is revoked.
4. THE SYSTEM SHALL accept v1 and v2 files in one command, routing by version, and SHALL clearly state what each check does and does not prove.
5. WHEN given `--revocations <file|url>` THE SYSTEM SHALL verify the ledger's signatures and chain without RPC, report each sigil's release state and the ledger's latest entry date, and, when `--rpc` is also present, report whether the file's head matches the `Ledger` PDA. It SHALL describe a release as a signed notice, never as proof.

### Requirement 6: Clock evidence

1. THE SYSTEM SHALL sample wall-clock and monotonic time at start, pause, resume, visibility change, and finish.
2. THE SYSTEM SHALL compute drift as the difference between wall-clock elapsed time and monotonic elapsed time, and SHALL record the maximum drift per session.
3. THE SYSTEM SHALL include the recorded drift in the v2 message and seal.
4. WHEN drift exceeds 2,000 ms THE SYSTEM SHALL label the record "clock moved" and SHALL still allow sealing, without claiming honest time.
5. THE SYSTEM SHALL never describe a signature as proof that wall-clock time was honest.

### Requirement 7: Configuration and network safety

1. THE SYSTEM SHALL read the program id, cluster, and RPC endpoint from build-time configuration with safe defaults; an empty program id SHALL disable minting.
2. WHEN the connected wallet's cluster differs from the configured cluster THE SYSTEM SHALL refuse to mint and explain the mismatch.
3. THE SYSTEM SHALL keep every secret out of the repository; `.env` remains ignored and only placeholders ship.

### Requirement 8: Quality gates

1. THE SYSTEM SHALL pass `npm run typecheck`, `npm test`, `npm run test:e2e` (including offline), and `npm run build` with the Solana changes in place.
2. The program test suite SHALL cover mint-once, soulbound enforcement, revocation, invalid signatures, and bounds rejection, and SHALL run on every program change.
3. The offline behaviour of the app SHALL be unchanged.

### Requirement 9: Compatibility

1. THE SYSTEM SHALL import v1 archives unchanged and treat v2 fields as optional additions.
2. The UI SHALL label each record's proof target (EVM chain or Solana cluster) and SHALL never imply a v1 record is a Solana sigil.
3. THE SYSTEM SHALL document the v2 attestation JSON schema and the canonical message format.

### Requirement 10: Truthful documentation

1. THE SYSTEM SHALL document the Solana design and threat model in `docs/solana-design.md`.
2. The README limitations SHALL state, without softening: the program is unaudited until an audit completes; revocation is a keeper-signed notice that a verifier sees only by consulting the ledger file or the program, and a stale ledger can hide a release; a signature still cannot prove wall-clock honesty.
3. WHEN a limitation is narrowed rather than removed THE SYSTEM SHALL say so in those words.
