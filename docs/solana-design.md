# Proof of focus — Solana (v0.2)

Vesper v0.2 moves the proof layer from EIP-712 on Base to Ed25519 on Solana. This document is the
contract between the app, the command-line verifier, and the Anchor program. It describes what is
built on `feat/solana-v0.2`, what is not, and what each check does and does not prove.

**Status.** The TypeScript core, the app panel, the verifier and the ledger are implemented and
tested. The Anchor program, the Token-2022 mint, the client mint flow and the devnet deployment are
not: they need the WSL2 toolchain in `.kiro/specs/proof-of-focus-solana/tasks.md` (Tasks 0, 8–13,
15). No vigil is minted, and the app never presents a seal as an on-chain record.

## What ships in this build

| Piece | Location |
| --- | --- |
| Canonical message, seal, sigil id | `src/lib/proof/canonical.ts` |
| Attestation v2 assembly and verification | `src/lib/proof/attestationV2.ts` |
| Encrypted keystore | `src/lib/proof/keystore.ts` |
| Keeper storage and forge/unlock checks | `src/lib/proof/keeperStore.ts` |
| Local Ed25519 keeper | `src/lib/proof/keeper.ts` |
| Wallet Standard glue (lazy) | `src/lib/proof/walletStandard.ts` |
| Clock evidence | `src/lib/proof/clock.ts` |
| Ledger format and chain | `src/lib/proof/ledger.ts` |
| Seal panel and chain labels | `src/components/SolanaSealPanel.tsx`, `CryptView`, `ReturnView` |
| Verifier, v1 and v2 | `scripts/verify-attestation.ts` |
| PDA readers and account layouts | `scripts/verify-solana.ts` |
| Empty shipped ledger | `public/revocations.ndjson` |

Not built: the Anchor program, `mint`/`revoke` transactions, the mint flow, the ledger page, and any
deployment. Requirements 4, 7.2, 13 and 15 of the spec remain open.

## The canonical message

The app signs these exact UTF-8 bytes, with LF line endings and no trailing newline:

```text
vesper.vigil.v2
cluster=devnet
program=unminted
sigil=<64 lowercase hex>
keeper=<base58>
startedAt=<digits only>
durationMin=<integer 1–600>
focusedSec=<digits only>
outcome=completed|released
clockDriftMs=<integer milliseconds|unknown>
seal=<64 lowercase hex>
```

- `program` is the program id, or `unminted` when none is configured.
- `startedAt` is a decimal string. It is never parsed into a local `Date` while signing.
- `clockDriftMs` is `unknown` when the session did not record drift.
- The signer must be the `keeper` named in the message. The verifier rebuilds the message and
  refuses anything that does not round-trip byte for byte.

Two hashes cover the record:

- **Sigil id:** `sha256("vesper.sigil.v2|" + vigil.id)`, lowercase hex. It is bound to the record's
  id, not its content, so it is stable across re-seals and is the PDA seed.
- **Seal v2:** `sha256("vesper.seal.v2|sigil|startedAt|endedAt|plannedMin|focusedSec|outcome|intention|ambience|drift")`,
  lowercase hex. `drift` is the integer milliseconds or `unknown`.

Any change to a covered field breaks the seal. A seal that does not match is reported as altered,
regardless of signature validity.

## Attestation v2

```json
{
  "v": 2,
  "app": "vesper",
  "chain": "solana",
  "cluster": "devnet",
  "program": null,
  "message": "vesper.vigil.v2\n…",
  "seal": "<64 lowercase hex>",
  "record": { "endedAt": "<digits>", "intention": "…", "ambience": "hollow" },
  "signature": "<base58, 64 bytes>",
  "keeper": "<base58>"
}
```

`record` carries the fields the message does not repeat. Without `endedAt`, `intention` and
`ambience` a verifier could not recompute the seal. The intention is therefore public in the
attestation, which the threat model already accepts.

Verification order: shape and version, message parse, `seal`/`keeper`/`cluster`/`program` agreement
between message and attestation, Ed25519 signature against `keeper`, `record` validity, and seal
recomputation. The app runs the same check after sealing and before storing or offering a download.
A vigil is labelled sealed only once that check passes.

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

- The wrapped secret is the 64-byte Ed25519 secret key. WebCrypto only.
- Stored at `vesper.keeper.v2`. The passphrase is never stored; the unlocked key lives only in
  memory.
- Forging writes the keystore, reads it back and proves it decrypts before returning the keeper.
- Unlocking checks that the derived address equals the stored address.
- The keeper locks on reload and after 15 minutes without pointer or key activity.
- A wrong passphrase fails closed with one message and reveals nothing.
- `migrateLegacyWallet` can wrap the v0.1 plaintext EIP-712 key at `vesper.keystore.v1`, but the
  v0.2 panel does not invoke it. The v0.1 local keeper still works from `vesper.wallet.v1`, and a
  32-byte secp256k1 key cannot sign Ed25519.

## Clock evidence

The timer samples wall clock and `performance.now()` when a vigil begins, pauses, resumes, returns
from a hidden tab, finishes, or auto-completes. Drift is the difference between wall elapsed time
and monotonic elapsed time; the session records the largest absolute value.

- Drift is inside the message and the seal, so it cannot be edited without breaking both.
- Over 2,000 ms the UI labels the record "clock moved" and still allows sealing.
- This is evidence, not proof. A clock that was wrong before the vigil began cannot be detected.

## Wallet Standard

Wallets are discovered through the Wallet Standard protocol: the page listens for
`wallet-standard:register-wallet` and dispatches `wallet-standard:app-ready`, and also reads the
deprecated `navigator.wallets` callbacks. Only wallets that declare the configured chain
(`solana:devnet`, or `solana:mainnet` for `mainnet-beta`) are offered.

The support module is loaded with a dynamic import, so the base bundle does not carry it. After
`standard:connect`, the page asks `solana:signMessage` for a signature over the canonical message,
encodes it as base58, and verifies it against the account's own public key before anything is stored.
A rejection returns to the unsealed state with a calm message. A signature that does not verify, or
an account whose public key does not match its address, is refused.

Sealing never sends a transaction. The cluster and program are labels in the signed message until a
mint instruction exists.

## Registry program (designed, not built)

Anchor, PDA-based, no admin instruction, no owner. Deployment sets the upgrade authority to none.

| Account | Seeds | Fields |
| --- | --- | --- |
| `Sigil` | `[b"sigil", sigil_id]` | sigil_id `[u8;32]`, keeper, seal `[u8;32]`, message_hash `[u8;32]`, art_hash `[u8;32]`, duration_min `u16`, focused_sec `u32`, outcome `u8`, minted_at `i64`, revoked `bool`, mint, bump `u8` |
| `Art` | `[b"art", sigil_id]` | raw SVG bytes (borsh `Vec<u8>`) |
| `Ledger` | `[b"ledger"]` | seq `u64`, head `[u8;32]`, bump `u8` |

Account discriminators are `sha256("account:Sigil")[0..8]` and `sha256("account:Ledger")[0..8]`.
The verifier mirrors two layouts; the program must match them exactly:

- `Sigil`, 217 bytes: discriminator 0–8, sigil id 8–40, keeper 40–72, seal 72–104, message hash
  104–136, art hash 136–168, duration `u16` LE 168–170, focused seconds `u32` LE 170–174, outcome
  174, minted-at `i64` LE 175–183, revoked 183, mint 184–216.
- `Ledger`, 49 bytes: discriminator 0–8, seq `u64` LE 8–16, head 16–48, bump 48.

Instructions:

1. `mint(...)` requires an Ed25519 verify instruction immediately before it. The program parses the
   instructions sysvar and compares program id, public key, message bytes and signature, then
   initialises the `Sigil` PDA (second mint for the same id fails), creates a Token-2022 mint with
   the NonTransferable extension, metadata pointer and metadata, mints one zero-decimal token and
   revokes the mint authority. There is no freeze authority.
2. `revoke(sigil_id, ledger_seq, ledger_prev, ledger_head)` requires the keeper signature, sets
   `revoked = true`, and advances the `Ledger` PDA only if `seq + 1 == ledger_seq` and the current
   head equals `ledger_prev`. Nothing is burned, transferred or closed.

The SVG lives on the `Art` account; the mint's metadata URI is a short link back to the app, which
regenerates the art from the seal and compares `art_hash`.

## The Requiem Ledger

A release must reach verifiers that never touch a cluster and must outlive a devnet reset. A single
static, signed file does both, provided its order is anchored on-chain.

`public/revocations.ndjson` ships with the site. One canonical line per release, no whitespace:

```text
{"v":1,"app":"vesper","seq":1,"sigil":"<64 hex>","keeper":"<base58>","revokedAt":"<digit epoch ms>","prev":"<64 hex>","signature":"<base58>"}
```

- `seq` starts at 1 and increases by one per line.
- `prev` is `sha256` of the previous line; the first entry uses 64 zeros.
- `signature` is Ed25519 by the entry's `keeper` over the line with the `,"signature":"…"` part
  removed. The body is rebuilt byte for byte before checking.
- An entry counts only if `keeper` equals the attestation's keeper; a stranger's entry is ignored.
- The shipped file is empty today because no program can revoke yet.

The verifier reads the file (or a URL) with `--revocations`, verifies every signature and the chain,
and prints the release state with an "as of" date. With `--rpc` it also compares the last line's hash
with the `Ledger` PDA head, which detects a truncated file. A release is always described as a
signed notice, never as proof. A stale file can hide a release, and a verifier with neither the file
nor RPC access sees neither.

## Verifier

```bash
npm run verify:attestation -- attestation.json
npm run verify:attestation -- archive.json --rpc https://api.devnet.solana.com
npm run verify:attestation -- archive.json --revocations public/revocations.ndjson
```

It routes v1 to the EIP-712 path and v2 to Ed25519, recomputes the seal, and prints explicit
"proves / does not prove" lines. `--rpc` reports minted state, keeper and revocation from the PDAs.
It imports `viem`, `tweetnacl`, `bs58`, `@solana/web3.js` and `src/lib/proof/ledger.ts` only.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SOLANA_CLUSTER` | `devnet` | Cluster named in every sealed message |
| `VITE_SOLANA_RPC` | `https://api.devnet.solana.com` | RPC endpoint for mint and lookups |
| `VITE_VESPER_PROGRAM` | empty | Program id; empty means `program=unminted` |

Public values only. Signing keys live in the Solana CLI keypair path outside the repository.

## Threat model

| Attack | Mitigation | Residue |
| --- | --- | --- |
| Stolen device reads the keeper | AES-GCM keystore, explicit unlock, idle lock | Unlocked memory while in use |
| Malicious site reads `localStorage` | Ciphertext only; passphrase never stored | XSS inside the app |
| Forged attestation | Ed25519 verification against the keeper | Keeper key theft |
| Edited record | Seal recomputed over every field | The intention is public |
| Duplicate mint | PDA initialised once | — |
| Transfer or sale | Token-2022 NonTransferable | Off-chain JSON can still change hands |
| Program upgrade changes rules | Upgrade authority set to none | Bugs become permanent |
| Clock manipulation | Drift evidence and the "clock moved" label | A clock wrong before the start |
| Revoked record still shown | Keeper-signed flag plus the chained ledger and its anchored head | A verifier holding neither file nor RPC, or a stale copy |
| On-chain release withheld from the ledger | The app writes the entry in the revoke flow; the flag stays authoritative | An offline verifier who trusts a withheld log |

## Operator steps (not run here)

The program needs Rust, the Solana CLI and Anchor inside WSL2. See the spec's Task 0. Build from a
clone inside the Linux filesystem, not `/mnt/c`. After a passing devnet deploy, set
`VITE_VESPER_PROGRAM` and `VITE_SOLANA_CLUSTER` for the build and exercise one mint end to end.
Devnet can be reset by its operators; a reset wipes the program and every sigil.

## Limitations

- The program and the ledger anchor are unaudited, and the program does not exist yet.
- The TypeScript account layout is a promise the program must keep.
- The v0.1 key migration is implemented but not wired into the v0.2 panel.
- A release is a signed notice. Without the file or RPC access a release is invisible; with a stale
  file it is invisible until a newer file or the anchored head is checked.
- Time is evidenced, not proven.
- Wallet signing proves that a key signed the message, not that the person at the keyboard owns it.
