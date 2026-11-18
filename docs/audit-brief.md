# Review brief — Vesper proof layer

This document is the hand-off for an independent security review. It states what the code claims to
guarantee, where each guarantee is enforced, which test pins it, and what it deliberately does not
prove. It is written to be attacked: every invariant below should be read as "try to break this and
say how".

**Status.** Nothing here has been audited. The app, the Solana TypeScript proof layer, the ledger and
the command-line verifier are implemented and tested on `feat/solana-v0.2`. The Anchor program, the
Token-2022 mint, the client mint flow and any deployment do not exist yet; their invariants are
described as obligations the program must meet when it is written.

## What is in scope

| Area | Where | Notes |
| --- | --- | --- |
| Canonical message, seal v2, sigil id | `src/lib/proof/canonical.ts` | Bytes are the contract |
| Attestation v2 assembly and verification | `src/lib/proof/attestationV2.ts` | App-side check |
| Ed25519 keeper | `src/lib/proof/keeper.ts` | tweetnacl, base58 addresses |
| Encrypted keystore | `src/lib/proof/keystore.ts` | PBKDF2 + AES-GCM, idle lock |
| Keeper storage and forge/unlock | `src/lib/proof/keeperStore.ts` | `localStorage` boundary |
| Keeper lifecycle hook | `src/hooks/useSolanaKeeper.ts` | Lock on reload and idle |
| Wallet Standard glue | `src/lib/proof/walletStandard.ts` | Lazy-loaded |
| Clock evidence | `src/lib/proof/clock.ts`, `src/lib/timer.ts`, `src/hooks/useVigilTimer.ts` | Evidence, not proof |
| Release ledger | `src/lib/proof/ledger.ts`, `public/revocations.ndjson` | Signed, chained file |
| Independent verifier | `scripts/verify-attestation.ts`, `scripts/verify-solana.ts` | Imports protocol code only |
| Seal UI and labels | `src/components/SolanaSealPanel.tsx`, `src/views/ReturnView.tsx`, `src/views/CryptView.tsx` | What the user is told |
| Archive sanitisation | `src/lib/storage.ts` | Untrusted import boundary |

Out of scope for this pass:

- `contracts/` — the v0.1 EVM registry is frozen; its invariants are in
  `.kiro/steering/web3-security.md` and unchanged by this branch.
- The audio engine, transmission composition and sigil drawing, except where they touch seals.
- Wallet extension implementations. The review treats any wallet as hostile.
- Devnet behaviour. Nothing is deployed.

## Assets

1. **The keeper's secret.** A 64-byte Ed25519 secret. If it leaks, the thief can sign fake vigils as
   the keeper and forge ledger entries for it. It cannot move funds; that scope is deliberate.
2. **The passphrase.** Never stored, never logged, never transmitted.
3. **The record.** Intention, times, duration, focused seconds, ambience, outcome, clock drift. The
   intention is public in any attestation, by design.
4. **The proof's meaning.** The app's labels ("sealed", "signature verified", "clock moved") and the
   verifier's output. A false "verified" is a product failure even when no key leaks.
5. **The ledger's order.** The sequence and chain of releases, and the fact that the newest entry is
   the newest.

## Actors and trust boundaries

| Party | Can | Is trusted for |
| --- | --- | --- |
| Keeper (human) | Sign anything with their key | Their own honesty |
| Browser app | Hold the unlocked key in memory, label the UI | Nothing after export |
| Wallet | Claim an address, produce a signature | Only that it holds the key for the address it claims |
| Cluster / RPC | Report accounts and instruction data | Nothing; all on-chain data is re-parsed and checked |
| Verifier operator | Choose files and URLs | Their own inputs |
| Future program | Enforce mint-once, revocation, ledger advance | Its deployed, immutable bytes |

The verifier exists so that no reader has to trust the app, the cluster, or this document.

## Invariants

Each invariant names how to try to break it. A finding is anything that makes one untrue.

### Message and seal (I-01 to I-08)

| # | Invariant | Enforced in | Pinned by |
| --- | --- | --- | --- |
| I-01 | One canonical message: 11 lines, LF, no trailing newline, fixed field order. Parsing must round-trip through `buildMessageV2` or fail. | `canonical.ts` `buildMessageV2`/`parseMessageV2`; duplicated in `verify-attestation.ts` | `tests/proof-canonical.test.ts`, `tests/proof-attestation.test.ts` |
| I-02 | `startedAt` and `focusedSec` are digit-only strings; `durationMin` is an integer 1–600. They are never passed through `Date`. | `canonical.ts`, `attestationV2.ts`, verifier | `tests/proof-canonical.test.ts` |
| I-03 | Seal v2 is `sha256("vesper.seal.v2|sigil|startedAt|endedAt|plannedMin|focusedSec|outcome|intention|ambience|drift")`, lowercase hex. Changing any covered field breaks it. | `canonical.ts` `sealPreimage`; verifier `sealV2Of` | `tests/proof-canonical.test.ts` (field-binding test), `tests/verify-solana.test.ts` |
| I-04 | The sigil id is `sha256("vesper.sigil.v2|" + vigil.id)`, bound to the id only, so it is stable across re-seals and is the PDA seed. | `canonical.ts` `sigilIdFor` | `tests/proof-canonical.test.ts` |
| I-05 | Drift is a signed integer or the literal `unknown`. An unsampled clock is never rendered as zero. | `canonical.ts` `driftValue`, `clock.ts` | `tests/proof-clock.test.ts` |
| I-06 | A signature counts only for the `keeper` named inside the message; the verifier verifies against exactly that key. | `attestationV2.ts`, verifier `verifyEd25519` | `tests/proof-attestation.test.ts`, `tests/verify-solana.test.ts` |
| I-07 | The attestation's `seal`, `keeper`, `cluster` and `program` must equal the message's; disagreement fails. | `attestationV2.ts`, verifier `verifyV2` | `tests/proof-attestation.test.ts`, `tests/verify-solana.test.ts` |
| I-08 | Seal mismatch is detected independently of signature validity. | `sealMatches`, verifier reporting | `tests/proof-attestation.test.ts`, `tests/verify-solana.test.ts` |

The app-side check and the verifier deliberately carry separate parsers and seal code, so a bug in
one does not bless the other. Their agreement is itself an invariant: a differential test feeding
both the same adversarial corpus would make divergence a test failure rather than a review finding.

### Keeper and keystore (I-09 to I-16)

| # | Invariant | Enforced in | Pinned by |
| --- | --- | --- | --- |
| I-09 | The secret exists only in memory and as AES-GCM ciphertext under `vesper.keeper.v2`. No export path includes it. | `keystore.ts`, `keeperStore.ts`, `storage.ts` (archive = vigils + settings) | `tests/proof-keystore.test.ts` ("never stores the secret in the clear") |
| I-10 | KDF is PBKDF2-SHA256 with at least 600,000 iterations, a 16-byte salt; cipher is AES-256-GCM with a 12-byte IV and a 128-bit tag. Downgraded parameters are refused at unlock. | `keystore.ts` | `tests/proof-keystore.test.ts` |
| I-11 | Unlock fails closed with one identical message for a wrong passphrase, tampered ciphertext, malformed structure or low iteration count. No oracle. | `keystore.ts` `unlockKeystore` | `tests/proof-keystore.test.ts`, `tests/proof-keeper-store.test.ts` |
| I-12 | Forge writes, reads back, decrypts and compares bytes before returning a keeper. | `keeperStore.ts` `forgeKeeper` | `tests/proof-keeper-store.test.ts` |
| I-13 | Unlock requires the derived address to equal the stored address. | `keeperStore.ts` `unlockKeeper` | `tests/proof-keeper-store.test.ts` ("address was rewritten") |
| I-14 | The keeper locks on reload and after 15 minutes without pointer or key activity; locking drops the in-memory key. | `useSolanaKeeper.ts`, `keystore.ts` `createIdleLock` | `tests/proof-keystore.test.ts` (idle lock) |
| I-15 | A wallet signature is checked against the account's own public key before it is used; address and key must agree; the signature must be 64 bytes. | `walletStandard.ts` `connectWallet` | `tests/proof-wallet-standard.test.ts` |
| I-16 | Wallet code stays in a lazy chunk; the base bundle does not carry it. | `useSolanaWallet.ts` dynamic import | build output, `dist/assets/walletStandard-*.js` |

### Ledger (I-17 to I-22)

| # | Invariant | Enforced in | Pinned by |
| --- | --- | --- | --- |
| I-17 | One canonical line per entry, no whitespace; the body is rebuilt and compared byte for byte. | `ledger.ts` `canonicalLedgerBody`/`parseLedgerLine` | `tests/proof-ledger.test.ts` |
| I-18 | `seq` starts at 1 and increases by one; `prev` is `sha256` of the previous line; genesis is 64 zeros; blank lines are invalid; CRLF is normalised. | `ledger.ts` `verifyLedger` | `tests/proof-ledger.test.ts` |
| I-19 | Every entry's signature is Ed25519 by the entry's own `keeper` over the canonical body. | `verifyLedger` callback in the verifier | `tests/proof-ledger.test.ts`, `tests/verifier.test.ts` |
| I-20 | A release counts only when `sigil` and `keeper` both match the attestation. | `ledger.ts` `releaseOf` | `tests/verifier.test.ts` |
| I-21 | A release is printed as "a signed notice, not proof"; a stale file cannot show a newer release than its last line. | verifier output | `tests/verifier.test.ts` |
| I-22 | With `--rpc`, the last line's hash must equal the program's `Ledger` head; a mismatch fails verification. | verifier `reportRegistry` | `tests/verify-solana.test.ts` |

**Known gap, stated plainly:** no client code path appends to the shipped ledger yet. `signLedgerEntry`
exists and is tested, but the revoke flow that will call it is Task 11 of the spec, which needs the
program. Until then `public/revocations.ndjson` is empty and the verifier's release reporting is
exercised only from fixtures.

### Verifier and account layouts (I-23 to I-26)

| # | Invariant | Enforced in | Pinned by |
| --- | --- | --- | --- |
| I-23 | The verifier imports no app storage or React code; it depends on `viem`, `tweetnacl`, `bs58`, `@solana/web3.js` and `src/lib/proof/ledger.ts`. | `scripts/verify-attestation.ts` imports | review |
| I-24 | Every input is shape-checked before use; unknown versions are refused rather than guessed; network reads time out. | verifier | `tests/verifier.test.ts`, `tests/verify-solana.test.ts` |
| I-25 | `Sigil` is 217 bytes and `Ledger` 49 bytes with the documented offsets; discriminators are `sha256("account:<Name>")[0..8]`; a wrong length or discriminator parses as invalid, never as a half-account. | `scripts/verify-solana.ts` | `tests/verify-solana.test.ts` |
| I-26 | The v1 (EIP-712) path is unchanged by this branch; v1 and v2 route on version and never mix checks. | verifier, `attestation.ts` | `tests/verifier.test.ts`, e2e |

### Obligations for the program (not built)

These bind the future Anchor program and its deploy; they cannot be tested yet.

1. `mint` consumes an Ed25519 verify instruction immediately preceding it and compares program id,
   public key, message bytes and signature; the message's `keeper` is the signer.
2. A `Sigil` PDA is initialised once; a second mint for the same sigil id fails.
3. The mint is Token-2022 with the NonTransferable extension, zero decimals, one token; mint
   authority revoked; no freeze authority.
4. `revoke` requires the keeper's signature, sets `revoked = true`, and advances the `Ledger` PDA only
   when `seq + 1` and the current head matches the entry's `prev`.
5. No admin, owner, upgrade, transfer, burn or close path. Upgrade authority is set to none after a
   passing deploy.
6. Account bytes match I-25 exactly, including discriminators and field order.

## Attack surface

| Input | Reaches | What to try |
| --- | --- | --- |
| `localStorage["vesper.keeper.v2"]` | `loadKeystore` → unlock | Replace with attacker keystore, rewrite `address`, downgrade iterations, inject oversized base64, omit fields. Unlock must fail closed and never yield a keeper the user did not create. |
| `localStorage["vesper.vault.v1"]` and imports | `storage.ts` sanitisation | Feed v2 records whose seal, attestation or sigil disagree; expect the record kept or dropped, never relabelled sealed. |
| Passphrase fields | forge/unlock forms | Empty, huge, non-ASCII, whitespace-only, repeated attempts. MIN is 8 characters; no trimming or normalising is performed, and that must be documented rather than silently changed. |
| Wallet Standard events | `watchWallets`, `connectWallet` | Register a hostile wallet at any time, claim another chain, return a mismatched public key, return a 64-byte signature by another key, throw during sign. All must leave the vigil unsealed. |
| Message and attestation JSON | app check, verifier, archive import | Unicode look-alikes in intentions, `\r\n` in messages, duplicate keys, numbers as strings, `program: ""` vs `null`, extreme durations, negative focused seconds, 1 MB signatures. |
| Ledger file or URL | `verifyLedger` | Duplicate lines, reordered entries, an entry signed by a different keeper, a body with extra whitespace, a trailing blank line, CRLF, a URL that redirects or hangs (10 s timeout). |
| RPC responses | `parseSigilAccount`, `parseLedgerAccount`, verifier | Short or long accounts, wrong discriminator, hostile seq beyond 2^53, a head that does not match. Must report, not crash. |
| Clipboard and downloads | `copyText`, `downloadText` | User-supplied intention in filenames; SVG text escaping in the sigil. |
| Build config | `src/lib/site.ts` | A non-base58 program id must fall back to `unminted`, never reach a signed message unvalidated. |

## Accepted residue

These are known and intentional. A report that restates them is welcome but is not a finding unless
the code contradicts them.

1. **Time is evidenced, not proven.** Drift compares wall time with `performance.now()` on the same
   device. A clock wrong before the vigil began is undetectable, and a determined keeper can lie.
2. **The keeper is the trust anchor.** A stolen unlocked device, or code executing in the page while
   the keeper is unlocked, can sign. The keystore protects at rest, not in use.
3. **Intentions are public** in any attestation, because the seal covers them.
4. **A release can be hidden.** A stale ledger, or a verifier with neither the file nor RPC access,
   cannot see it. The on-chain flag is authoritative once the program exists.
5. **Cluster and program are labels** in the signed message. Only `--rpc` reads real chain state;
   sealing never sends a transaction.
6. **Losing the passphrase loses the keeper.** Records already sealed stay verifiable; nothing can
   re-sign.
7. **The program does not exist yet.** Nothing is deployed, and the TypeScript layouts are a promise
   the program must keep.
8. **The app is a local-first single page.** It has no backend and no accounts, so there is no
   server-side rate limit or revocation list beyond the signed file.

## How to reproduce the checks

```bash
npm ci
npm run typecheck
npm test                    # 20 files, 155 tests
npm run test:e2e            # e2e + offline, includes the seal and export path
npm run build               # typecheck + production build
npm run verify:attestation -- tests/fixtures/…   # or any exported archive
```

Contract workspace (frozen, included so a reviewer can confirm it is untouched):

```bash
cd contracts && npx tsc --noEmit && npm test    # 9 passing
```

## Where to start

If time is short, spend it on these, in order:

1. **Message round-trip.** Feed `parseMessageV2` and the verifier's parser the same adversarial
   corpus and diff their verdicts. Divergence is the cheapest route to a verifier/app disagreement.
2. **Seal coverage.** Construct two records that differ in exactly one covered field and confirm the
   seal changes; then edit each field of a signed archive and confirm the verifier fails.
3. **Keystore at rest.** Attempt parameter downgrade, address rewrite and structural tampering; then
   confirm no error message distinguishes the cases.
4. **Ledger canonicalisation.** Try to make two different texts verify to the same head, or a head
   that hides a middle line.
5. **UI honesty.** Walk every state in `SolanaSealPanel` and `CryptView`: a record must never read as
   sealed or verified unless the app's own verification returned true for the message it displays.
