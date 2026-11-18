# Design — Proof of Focus, Solana

## Architecture

```text
begin ──▶ vigil ──▶ finish ──▶ seal v2 (SHA-256) ──▶ sign (Ed25519)
                                          │                │
                                          │                ├─ local keeper (encrypted keystore)
                                          │                └─ wallet signMessage
                                          ▼
                             attestation v2 (JSON) ──▶ verifier (tweetnacl + web3.js)
                                          │
                                          └─ optional ──▶ Anchor program (devnet)
                                                          ├─ Sigil PDA (mint-once)
                                                          ├─ Art PDA (SVG bytes)
                                                          └─ Token-2022 NFT (NonTransferable)
```

The proof layer is a pure TypeScript core plus one Solana program. React views consume the core; nothing about the ritual changes. EVM code from v0.1 stays in `contracts/` and remains the verifier path for v1 records, but v0.2 does not extend it.

## Canonical message (v2)

```text
vesper.vigil.v2
cluster=devnet
program=<base58 program id, or "unminted">
sigil=<32-byte hex>
keeper=<base58 public key>
startedAt=<digit-only decimal string>
durationMin=<1..600>
focusedSec=<integer>
outcome=<completed|released>
clockDriftMs=<integer or "unknown">
seal=<32-byte hex, lowercase>
```

Rules that make it safe:

- UTF-8, `\n` separators, no trailing newline, no locale-dependent formatting.
- `startedAt` never passes through `Date`; it is copied from the stored record.
- The sigil id is `sha256("vesper.sigil.v2|" + vigil id)`, lowercase hex. It names the PDA and does not depend on the record, so the seal alone decides whether the record was edited.
- The seal is `sha256("vesper.seal.v2|" + sigil + "|" + startedAt + "|" + endedAt + "|" + plannedMin + "|" + focusedSec + "|" + outcome + "|" + intention + "|" + ambience + "|" + clockDriftMs)`, lowercase hex.
- SHA-256 rather than keccak because the program and the Solana toolchain speak SHA-256 natively; v1 keccak seals remain computed as before.

Attestation v2:

```json
{
  "v": 2,
  "app": "vesper",
  "chain": "solana",
  "cluster": "devnet",
  "program": "…",
  "message": "vesper.vigil.v2\n…",
  "seal": "<64 hex characters>",
  "record": {
    "endedAt": "1768037100000",
    "intention": "Finish the chapter",
    "ambience": "hollow"
  },
  "signature": "<base58, 64 bytes>",
  "keeper": "<base58>"
}
```

`record` carries the three sealed fields the message does not repeat (`endedAt`, `intention`, `ambience`); the rest come from the message. Without them a verifier cannot recompute the seal, and Task 7.2 would be a claim rather than a check. The intention is therefore public in the attestation, which the threat model already states.

## Encrypted keystore

```json
{
  "v": 2,
  "address": "<base58>",
  "createdAt": "2026-11-18T00:00:00.000Z",
  "kdf": { "name": "PBKDF2-SHA256", "iterations": 600000, "salt": "<base64 16 bytes>" },
  "cipher": { "name": "AES-256-GCM", "iv": "<base64 12 bytes>", "data": "<base64>" }
}
```

- The wrapped secret is the 64-byte Ed25519 secret key from `nacl.sign.keyPair()`.
- WebCrypto only; no third-party crypto in the keystore path.
- Unlock is explicit, memory-only, and locks after 15 minutes idle or on reload.
- Migration: read `vesper.wallet.v1`, prompt once, encrypt, re-read the keystore to prove it decrypts, then delete the plaintext key. If any step fails the plaintext stays and the app says so.

## Solana program

Anchor, PDA-based, no admin instruction.

| Account | Seeds | Fields |
| --- | --- | --- |
| `Sigil` | `[b"sigil", sigil_id]` | sigil_id `[u8;32]`, keeper, seal `[u8;32]`, message_hash `[u8;32]`, art_hash `[u8;32]`, duration_min `u16`, focused_sec `u32`, outcome `u8`, minted_at `i64`, revoked `bool`, mint, bump `u8` |
| `Art` | `[b"art", sigil_id]` | raw SVG bytes (borsh `Vec<u8>`) |

Instructions:

1. `mint(sigil_id, seal, message_hash, duration_min, focused_sec, outcome, art_hash, art_len)`
   - Requires an Ed25519 verify instruction immediately before it.
   - Loads the instructions sysvar, checks the previous instruction's program id, public key, message bytes, and signature; compares the message hash to the argument.
   - Initialises the `Sigil` PDA (fails if it exists), writes the record.
   - Creates a Token-2022 mint with the NonTransferable extension, metadata pointer and TokenMetadata (name `Vesper Sigil`, symbol `VSPR`, URI pointing at the app route for the sigil), a zero-decimals supply of one, then revokes the mint authority.
2. `revoke(sigil_id)` — keeper signs; sets `revoked = true`. No burn, no transfer, no close.

Deployment sets the upgrade authority to none immediately after a passing deploy, so the program is immutable.

Token metadata limits are small, so the SVG is not stored as a URI. It lives on the `Art` account; the URI is a short link to the app, which regenerates and verifies the art from the seed and compares `art_hash`.

## Clock evidence

At begin, pause, resume, visibility change and finish, record `{ wall: Date.now(), mono: performance.now() }`. Drift is `(wallNow - wall0) - (monoNow - mono0)`; every sample is compared against the first, and `clockDriftMs` is the largest absolute deviation, rounded. Behaviour:

- `|drift| <= 2000` → record "clock steady"; seal normally.
- `|drift| > 2000` → record "clock moved by Xs"; still seal, label the record, never call the time proven.

This catches sleep, manual clock changes and some throttling. It cannot detect a clock that was wrong before the session started — the limitation is narrowed, not removed, and the UI says exactly that.

## Verifier

`npm run verify:attestation -- file.json` keeps one entry point:

- `v: 1` → existing EIP-712 recovery path.
- `v: 2` → decode base58 signature, verify Ed25519 with `tweetnacl`, recompute the seal, optionally query the PDA with `--rpc` and report minted/revoked.
- Prints what each check proves and what it does not.

Imports: `tweetnacl`, `bs58`, `@solana/web3.js`. Nothing from `src/`.

## Threat model

| Attack | Mitigation | Residue |
| --- | --- | --- |
| Stolen device reads the keeper | Encrypted keystore, explicit unlock, idle lock | Unlocked memory while in use |
| Malicious site reads localStorage | Ciphertext only; passphrase never stored | XSS in the app itself |
| Forged attestation | Ed25519 verification against keeper | Keeper key theft |
| Edited record | Seal recomputed over all fields | Intention text is not secret |
| Duplicate mint | PDA init-once | — |
| Transfer or sale of a sigil | Token-2022 NonTransferable | Off-chain transfer of the JSON |
| Program upgrade changes rules | Upgrade authority set to none | Bugs are permanent |
| Clock manipulation | Drift evidence, "clock moved" label | Pre-session wrong clock |
| Revoked record still presented | Keeper-signed flag; verifier consults RPC | Verifier that ignores the flag |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SOLANA_CLUSTER` | `devnet` | Expected cluster |
| `VITE_SOLANA_RPC` | `https://api.devnet.solana.com` | RPC endpoint for mint and lookups |
| `VITE_VESPER_PROGRAM` | empty | Program id; empty disables minting |

Secrets never enter these files. Deployment keys stay in the Solana CLI keypair path outside the repo.

## Toolchain (Windows via WSL2)

Native Windows builds of the Solana toolchain are fragile; use WSL2.

```bash
wsl --install -d Ubuntu          # PowerShell, once
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev libudev-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install latest && avm use latest
solana-keygen new --no-bip39-passphrase
solana config set --url devnet
solana airdrop 2
```

Build from a clone inside the WSL filesystem (for example `~/vesper`), not from `/mnt/c`, or the Rust build will be slow.

## Deployment

```bash
anchor build
anchor test
anchor deploy --provider.cluster devnet
solana program set-upgrade-authority <PROGRAM_ID> --final
solana program show <PROGRAM_ID> --url devnet
```

Record the program id in the repository variables for the build. Devnet can be reset by its operators; a reset wipes program and state, which is acceptable for a testnet and is stated in the docs.

## Testing

| Layer | Tool | Coverage |
| --- | --- | --- |
| Message and seal | Vitest | Determinism, field order, v1 compatibility |
| Keystore | Vitest | Round trip, wrong passphrase, tampered ciphertext, migration |
| Signature | Vitest | Ed25519 sign/verify with `tweetnacl` |
| Program | LiteSVM in `cargo test`, plus `anchor test` | Mint-once, soulbound, revocation, bad signature, bounds |
| Client | Playwright | Seal → mint on devnet (skipped without a program id), honest failure states |
| Offline | Playwright | Unchanged from v0.1 |

## Migration and compatibility

- Vault version stays `1`; new records add optional `sealV2`, `message`, `clockDriftMs`, `solana`.
- One export may contain both v1 and v2 attestations; the verifier routes per file.
- The UI shows a chain chip per record (`Base` for v1, `Solana devnet` for v2).

## Open decisions

1. Token-2022 metadata versus Metaplex Core for wallet rendering. v0.2 starts with Token-2022 metadata because it removes the external program dependency; Core can replace it later without touching the PDA.
2. Whether revocation should also be published in an append-only log outside the program, so verifiers without RPC access can still see it.
3. Whether the app should keep the EVM mint button for v1 records or retire it once Solana is live.
