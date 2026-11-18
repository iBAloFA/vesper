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
                                                          ├─ Ledger PDA (revocation head)
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
| `Ledger` | `[b"ledger"]` | `seq u64`, `head [u8;32]`, `bump u8` |

Instructions:

1. `mint(sigil_id, seal, message_hash, duration_min, focused_sec, outcome, art_hash, art_len)`
   - Requires an Ed25519 verify instruction immediately before it.
   - Loads the instructions sysvar, checks the previous instruction's program id, public key, message bytes, and signature; compares the message hash to the argument.
   - Initialises the `Sigil` PDA (fails if it exists), writes the record.
   - Creates a Token-2022 mint with the NonTransferable extension, metadata pointer and TokenMetadata (name `Vesper Sigil`, symbol `VSPR`, URI pointing at the app route for the sigil), a zero-decimals supply of one, then revokes the mint authority.
2. `revoke(sigil_id, ledger_seq, ledger_prev, ledger_head)` — keeper signs; sets `revoked = true`. Requires `ledger.seq + 1 == ledger_seq` and `ledger.head == ledger_prev`, then writes `(ledger_seq, ledger_head)` to the `Ledger` PDA. No burn, no transfer, no close.

Deployment sets the upgrade authority to none immediately after a passing deploy, so the program is immutable.

Token metadata limits are small, so the SVG is not stored as a URI. It lives on the `Art` account; the URI is a short link to the app, which regenerates and verifies the art from the seed and compares `art_hash`.

## The Requiem Ledger (revocation)

A revocation must reach verifiers that never touch a cluster, and it must survive a devnet reset. One static, signed file does both, provided its order is anchored on-chain.

`public/revocations.ndjson` ships with the site next to the app. One entry per line, canonical JSON, fixed field order, no whitespace:

```text
{"v":1,"app":"vesper","seq":1,"sigil":"<64 hex>","keeper":"<base58>","revokedAt":"<digit-only epoch ms>","prev":"<64 hex>","signature":"<base58>"}
```

Rules that make it safe:

- `seq` is a global, gap-free counter starting at 1. `revokedAt` is a digit-only epoch-ms string, written once at release and signed exactly as written.
- `prev` is lowercase hex SHA-256 of the previous line exactly as written (without its newline), or 64 zeros for `seq` 1. Editing, reordering or dropping a line breaks every later `prev`.
- `signature` is Ed25519 by the entry's `keeper` over the exact bytes of the line with the `signature` field removed. The line is rebuilt from its parsed fields and compared before anything else, exactly as with the v2 message.
- An entry counts against a sigil only when its `keeper` equals the keeper in that sigil's attestation. An entry signed by another keeper is reported as irrelevant, never as a release.
- Only minted sigils can be released; without a program id there is nothing on-chain to revoke, and the ledger stays empty.

The `Ledger` PDA (seeds `[b"ledger"]`) stores `seq`, `head` and `bump`. `revoke` requires the successor sequence and the current head, and writes the new head, so the chain is linear on-chain: two releases cannot both claim the same successor, and any copy of the file can be checked against the program.

How it is used:

- The app cannot write to a static site. On release it signs the new line, anchors the head with the `revoke` transaction, then offers the updated file for download; publishing is a commit to `public/revocations.ndjson`. Any copy whose head matches the program is as current as the site's.
- `npm run verify:attestation -- <file> --revocations <file|url>` needs no RPC. It prints `no release known in this ledger as of <date>` or `released by the keeper at <date> — a signed notice, not proof`, where the date is the latest `revokedAt` in the file.
- Adding `--rpc` compares the file's last `(seq, head)` with the `Ledger` PDA and prints `the ledger's head matches the program` or `the ledger is stale or altered`.

What it does not do: an offline verifier holding an older copy still sees an un-revoked record; the "as of" date makes that visible, and the anchor closes it only for verifiers with RPC. That is the residue, stated rather than hidden. Most registries treat revocation as mutable metadata or a backend allowlist; a static, chained, keeper-signed ledger with an anchored head is unusual, costs one PDA and a few dozen lines in the verifier, and leaves the claim checkable by anyone. The name is the ritual's: a sigil is released, never deleted.

## Clock evidence

At begin, pause, resume, visibility change and finish, record `{ wall: Date.now(), mono: performance.now() }`. Drift is `(wallNow - wall0) - (monoNow - mono0)`; every sample is compared against the first, and `clockDriftMs` is the largest absolute deviation, rounded. Behaviour:

- `|drift| <= 2000` → record "clock steady"; seal normally.
- `|drift| > 2000` → record "clock moved by Xs"; still seal, label the record, never call the time proven.

This catches sleep, manual clock changes and some throttling. It cannot detect a clock that was wrong before the session started — the limitation is narrowed, not removed, and the UI says exactly that.

## Verifier

`npm run verify:attestation -- file.json` keeps one entry point:

- `v: 1` → existing EIP-712 recovery path.
- `v: 2` → decode base58 signature, verify Ed25519 with `tweetnacl`, recompute the seal, optionally query the PDA with `--rpc` and report minted/revoked.
- `--revocations <file|url>` → verify the ledger's signatures and chain, report release state per sigil, and print the latest entry's date; with `--rpc` also compare the file's head with the `Ledger` PDA.
- Prints what each check proves and what it does not.

Imports: `tweetnacl`, `bs58`, `@solana/web3.js`, and `src/lib/proof/ledger.ts`, which is protocol code with no storage, state or React. Nothing else from `src/`.

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
| Revoked record still presented | Keeper-signed flag; signed ledger with its head anchored on-chain | A verifier holding neither the ledger file nor RPC access, or holding a stale copy (the "as of" date says how stale) |
| A release is on-chain but missing from the ledger | The app emits the entry in the same flow as the transaction; the flag stays authoritative | An offline verifier who trusts a withheld log |

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
| Ledger | Vitest | Chain order, entry signature, foreign keeper, non-canonical line, stale file against a simulated head |
| Signature | Vitest | Ed25519 sign/verify with `tweetnacl` |
| Program | LiteSVM in `cargo test`, plus `anchor test` | Mint-once, soulbound, revocation, ledger sequencing, bad signature, bounds |
| Client | Playwright | Seal → mint on devnet (skipped without a program id), honest failure states |
| Offline | Playwright | Unchanged from v0.1 |

## Migration and compatibility

- Vault version stays `1`; new records add optional `sealV2`, `message`, `clockDriftMs`, `solana`.
- One export may contain both v1 and v2 attestations; the verifier routes per file.
- The UI shows a chain chip per record (`Base` for v1, `Solana devnet` for v2).

## Decisions and open questions

1. Whether Token-2022 metadata or Metaplex Core renders better in wallets. v0.2 starts with Token-2022 metadata because it removes the external program dependency; Core can replace it later without touching the PDA.
2. Decided 2026-11-18 — a second, off-chain revocation log is adopted. `public/revocations.ndjson` holds keeper-signed, hash-chained entries; the head is anchored in the `Ledger` PDA; the verifier reads it with `--revocations`, and wording stays "a signed notice, not proof". See The Requiem Ledger. Revocation is no longer invisible to verifiers without RPC; only staleness remains, and it is dated.
3. Whether the app should keep the EVM mint button for v1 records or retire it once Solana is live.
