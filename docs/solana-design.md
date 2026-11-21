# Proof of focus — Solana (v0.2)

Vesper v0.2 moves the proof layer from EIP-712 on Base to Ed25519 on Solana. This document is the
contract between the app, the command-line verifier, and the Anchor program. It describes what is
built on `feat/solana-v0.2`, what is not, and what each check does and does not prove.

**Status.** The TypeScript core, the app panel, the verifier, the ledger and the Anchor program are
implemented and tested. The program passes its host tests and a local-validator integration suite
that mints a sigil, writes the art in chunks, anchors a release through the ledger, and checks every
refusal path (`solana/tests/mint-release.ts`). It is deployed to devnet at
`94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX` (slot 524037293) with the upgrade authority set to
none, so the deployed rules cannot change. A real vigil was sealed, minted and released from the
app in a browser against devnet, and the command-line verifier with `--rpc` confirmed the minted
record, the keeper, the release and the ledger head. Devnet may be reset by its operators, which
would wipe the program and every sigil.

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
| Mint and release transactions | `src/lib/proof/solanaMint.ts` |
| Verifier, v1 and v2 | `scripts/verify-attestation.ts` |
| PDA readers and account layouts | `scripts/verify-solana.ts` |
| Anchor program and IDL | `solana/programs/vesper-sigil/` (`anchor idl build` writes the IDL) |
| Program integration suite | `solana/tests/mint-release.ts`, `solana/scripts/test.sh` |
| Shipped ledger | `public/revocations.ndjson` (two devnet releases) |

The devnet deployment is done; see the operator steps below for how it was built and what it
pinned.

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

## Registry program (deployed on devnet, immutable)

Anchor, PDA-based, no admin instruction, no owner. Deployment sets the upgrade authority to none.

| Account | Seeds | Fields |
| --- | --- | --- |
| `Sigil` | `[b"sigil", sigil_id]` | sigil_id `[u8;32]`, keeper, seal `[u8;32]`, message_hash `[u8;32]`, art_hash `[u8;32]`, art_len `u32`, duration_min `u16`, focused_sec `u32`, outcome `u8`, minted_at `i64`, revoked `bool`, mint, bump `u8` |
| `Art` | `[b"art", sigil_id]` | raw SVG bytes (borsh `Vec<u8>`), account sized `8 + 4 + art_len` |
| `Ledger` | `[b"ledger"]` | seq `u64`, head `[u8;32]`, bump `u8` |

Account discriminators are `sha256("account:Sigil")[0..8]` and `sha256("account:Ledger")[0..8]`.
The verifier mirrors two layouts; the program must match them exactly:

- `Sigil`, 221 bytes: discriminator 0–8, sigil id 8–40, keeper 40–72, seal 72–104, message hash
  104–136, art hash 136–168, art length `u32` LE 168–172, duration `u16` LE 172–174, focused
  seconds `u32` LE 174–178, outcome 178, minted-at `i64` LE 179–187, revoked 187, mint 188–220.
- `Ledger`, 49 bytes: discriminator 0–8, seq `u64` LE 8–16, head 16–48, bump 48.

Instructions:

1. `mint(...)` requires an Ed25519 verify instruction immediately before it. The program parses the
   instructions sysvar and compares program id, public key, message bytes and signature, then
   initialises the `Sigil` PDA (second mint for the same id fails), reserves the `Art` PDA at the
   sealed `art_len`, creates a Token-2022 mint with the NonTransferable and MetadataPointer
   extensions, metadata, creates the keeper's associated token account, mints one zero-decimal token
   and revokes the mint authority. There is no freeze authority.
2. `write_art(sigil_id, offset, chunk)` appends to the `Art` PDA. A transaction is capped at 1232
   bytes, so the ~4 KB SVG cannot ride in the mint instruction; the app writes it in 700-byte chunks
   once the mint confirms. Each offset must continue what is already written; the final chunk is
   hashed against `art_hash` and a mismatch rolls the chunk back.
3. `revoke(sigil_id, ledger_seq, ledger_prev, ledger_head)` requires the keeper signature, sets
   `revoked = true`, and advances the `Ledger` PDA only if `seq + 1 == ledger_seq` and the current
   head equals `ledger_prev`. Nothing is burned, transferred or closed.

Two Token-2022 details shape the order: `InitializeMint2` requires the mint account to be exactly
`try_calculate_account_len` bytes for the extensions initialised so far, so the account is created at
that length and funded for the later metadata realloc; and the associated token account can only be
created after the mint exists, so the program creates it by CPI with `CreateIdempotent`.

The SVG lives on the `Art` account; the mint's metadata URI is a short link back to the app, which
regenerates the art from the seal and compares `art_hash`.

## Reading a minted sigil

The metadata URI written at mint is `https://ibalofa.github.io/vesper/#/sigil/<sigil id>`. The app
serves it as a hash route, so static hosting needs no rewrite: `#/sigil/:id` derives the `Sigil` and
`Art` PDAs, reads both accounts over JSON-RPC, checks the owner and discriminators, and draws the art
only when `sha256(art) == art_hash`. A mismatch is reported as a mismatch and the bytes are not
drawn; a missing `Art` account is reported without implying the record itself is incomplete.

`scripts/fetch-art.ts` (`npm run fetch:art -- --sigil <id>`) is the same reading in a terminal, with
no app involved: it prints the record, refuses art whose bytes do not hash to the record, and writes
nothing on refusal. `--metadata` additionally emits a metadata document whose `image` is the art as a
data URI. That document exists because on-chain metadata is a URI, not a document: wallets that can
render a web page use the viewer, wallets that need a JSON document use `--metadata`.

The link is fixed at mint time. The program has no metadata update instruction and no authority, so a
change of hosting or link shape would need a new program and new mints; the `#/sigil/:id` route is
kept stable for that reason, and the viewer's decoder lives in `src/lib/proof/registry.ts`, shared
with the CLI and the verifier.

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
- The shipped file holds two devnet releases: a client-code smoke release (seq 1) and a release
  written by the app during the browser exercise (seq 2). Both are keeper-signed and the second
  chains from the first; the `Ledger` PDA head matches the last line.

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

## Operator steps (used for the devnet deploy)

The program needs Rust, the Solana CLI and Anchor inside WSL2. See the spec's Task 0. Build from a
clone inside the Linux filesystem, not `/mnt/c`. `solana/scripts/build.sh` drives the SBF build
directly (`cargo-build-sbf --arch sbfv1 --tools-version v1.52`, then `anchor idl build`, then
`cargo test --workspace`): Anchor 0.31.3 still passes the legacy `v3` arch name to cargo-build-sbf,
and platform-tools v1.53+ renamed the `sbf-*` targets to `sbpf-*`, which the cargo-build-sbf bundled
with Agave 4.4 does not look for, so v1.52 is pinned. `solana/Cargo.lock` is
committed and pins `blake3` and `zeroize` to releases that older toolchains can also parse.

`solana/scripts/test.sh` then starts a fresh local validator serving the built `.so` and runs
`solana/tests/mint-release.ts`, which mints, writes the art in chunks, anchors two releases and
checks every refusal path (19 checks). It needs Node with `npx tsx` reachable from the same shell.

The deploy followed the same steps, then `solana program show` reported `Authority: none`, so the
program is immutable. After deployment set `VITE_VESPER_PROGRAM` and `VITE_SOLANA_CLUSTER` for the
build; with those set, one vigil was sealed, minted and released from a browser session. Devnet can
be reset by its operators; a reset wipes the program and every sigil.

## Limitations

- The program and the ledger anchor are unaudited. They are deployed on devnet only, with the
  upgrade authority burned; the deployed bytes are the authority from now on, bugs included.
- The TypeScript account layouts were checked against the deployed program with the verifier's
  `--rpc` path, but the program cannot be changed if they ever disagree.
- The v0.1 key migration is implemented but not wired into the v0.2 panel.
- A release is a signed notice. Without the file or RPC access a release is invisible; with a stale
  file it is invisible until a newer file or the anchored head is checked.
- Time is evidenced, not proven.
- Wallet signing proves that a key signed the message, not that the person at the keyboard owns it.
- Token metadata points at the `#/sigil/<id>` viewer, which needs JavaScript and a reachable RPC.
  Wallets that cannot render a web page show the link rather than the art; `fetch:art --metadata`
  covers them, and no one can alter the URI because the program is immutable.
