# Design Document

## Overview

Proof of focus has one source of truth: the vigil record and the EIP-712 signature over its identifying fields. Everything else — the badge in the crypt, the JSON export, the CLI verifier, the soulbound token — must be reconstructible from that pair. The app therefore treats signing as an explicit opt-in ceremony and verification as a pure, repeatable operation.

```
 ritual ──▶ Vigil record ──▶ seal ──▶ typed data ──▶ signature ──▶ attestation
                │                                        │
                │                                        ├──▶ in-app recovery
                └──▶ archive export ──▶ scripts/verify-attestation.ts
                                         │
                                         └──▶ VesperSigils.mint (optional)
```

## Architecture Decisions

| Decision | Rationale |
| --- | --- |
| EIP-712 over `personal_sign` | Typed, human-readable fields; domain binding prevents replay; wallets display structure. |
| `startedAt` as a decimal string | Matches the on-chain `string` field exactly; avoids JSON number precision drift and ABI re-encoding differences. |
| Seal covers the full record | The signature commits to content, not just timestamps; editing the archive breaks the seal. |
| Local keeper as a first-class option | The ritual is usable without MetaMask; a generated key keeps the crypto real. |
| Verification in the default build | The product demonstrates the verification story on its own return screen. |
| Independent Node verifier | Proof does not depend on running the app or trusting its UI. |
| Soulbound, no admin | Mint-only, no transfers, no burn, no upgrade; the registry cannot mutate history. |
| On-chain SVG tokenURI | The token is self-describing even if every frontend disappears. |
| Ignition for deployment | Reproducible, idempotent deployments with environment-only secrets. |

## EIP-712 Schema

```
domain = {
  name: "Vesper",
  version: "1",
  chainId,                    // keeper's chain (default Base 8453)
  verifyingContract?          // registry address when configured
}

types = {
  Vigil: [
    { name: "id",          type: "bytes32" },
    { name: "keeper",      type: "address" },
    { name: "startedAt",   type: "string"  },
    { name: "durationMin", type: "uint32"  },
    { name: "seal",        type: "bytes32" }
  ]
}
```

Values:

- `id = keccak256(utf8(vigil.id))`.
- `startedAt = String(vigil.startedAt)`, digit-only.
- `durationMin = clamp(vigil.plannedMin, 1, 600)`.
- `seal = keccak256("vesper.seal.v1|…" as defined in vigil-core)`.

The signature is 65 bytes, `r || s || v`, produced by viem's `signTypedData` (local keeper) or `eth_signTypedData_v4` (injected wallet).

## Attestation Record

```ts
interface StoredAttestation {
  address: `0x${string}`;   // signer
  chainId: number;          // chain at signing time
  kind: "local" | "injected";
  signature: `0x${string}`;
  signedAt: number;
  domain: { name: "Vesper"; version: "1"; chainId: number; verifyingContract?: `0x${string}` };
  message: { id: `0x${string}`; keeper: `0x${string}`; startedAt: string; durationMin: number; seal: `0x${string}` };
}
```

Invariants enforced both in `storage.ts` and `verify-attestation.ts`:

1. `keeper == address` (case-insensitive).
2. `1 ≤ durationMin ≤ 600`.
3. `startedAt` matches `/^\d+$/`.
4. `id` and `seal` are 32-byte hex; signature is 65-byte hex.
5. Domain is exactly `("Vesper", "1")` with a positive integer chain id.

## Wallet Layer

`src/lib/wallet.ts` exposes:

- `hasInjectedWallet()` — checks `window.ethereum`.
- `connectInjected()` — `eth_requestAccounts`, address validation, `eth_chainId`.
- `createLocalKeeper()` — viem `generatePrivateKey` + `privateKeyToAccount`.
- `signVigil(wallet, vigil, verifyingContract?)` — builds typed data, signs via the right backend, returns a fully populated attestation.
- `watchInjectedWallet(cb)` — resubscribes to `accountsChanged` / `chainChanged`.
- `shortAddress`, `walletKindLabel` — presentation helpers.

A local keeper is stored as `{ kind: "local", address, chainId, privateKey }`. It is never included in archive exports and is erased by disconnect. The UI warns before creation and never redisplays the key.

## In-App Verification

`verifyAttestation()` performs the structural checks, then calls viem `recoverTypedDataAddress` with the *stored* domain and message. It returns `false` on any throw. The return view and crypt render three states:

- **Signed & verified** — green seal mark, keeper address, chain.
- **Signed but unverifiable** — explicit failure, never a checkmark.
- **Unsigned** — "no attestation" with a path to sign.

Seal verification is separate: `verifySeal(vigil)` recomputes the canonical hash. A record can have a valid signature over a seal that no longer matches its fields; the UI flags that as altered.

## Independent Verifier

`scripts/verify-attestation.ts` accepts either a single attestation JSON or an exported archive:

```
npm run verify:attestation -- vesper-attestation.json
npm run verify:attestation -- vesper-archive-2026-11-18.json
```

It validates every field, recovers the signer, optionally recomputes each archive seal, prints a per-vigil report, and exits 1 on any failure. It imports viem directly and shares no code with the app, so a bug in the UI cannot mask a bad signature.

## Registry Contract

`contracts/contracts/VesperSigils.sol` — Solidity 0.8.34, OpenZeppelin 5.6 (`ERC721`, `EIP712`, `ECDSA`, `Base64`, `Strings`).

```
contract VesperSigils is ERC721, EIP712 {
  struct Vigil { bytes32 id; address keeper; string startedAt; uint32 durationMin; bytes32 seal; }
  mapping(bytes32 => uint256) private _tokenOfSigil;
  mapping(uint256 => bytes32) public sealOf;
  mapping(uint256 => uint32) public durationOf;
  mapping(uint256 => string) public startedAtOf;
  uint256 public totalSupply;
  event SigilSealed(uint256 indexed tokenId, bytes32 indexed sigilId, address indexed keeper, bytes32 seal);
}
```

Mint flow:

1. Reject duplicate `sigilId` (`AlreadySealed`).
2. Require `vigil.keeper == msg.sender` (`KeeperMismatch`).
3. Validate non-zero seal, duration 1–600, digit-only timestamp.
4. Recompute `_hashTypedDataV4(keccak256(abi.encode(VIGIL_TYPEHASH, …)))` and recover; require the keeper.
5. Increment `totalSupply`, write lookups, `_safeMint`, emit `SigilSealed`.

Soulbound enforcement: `approve` and `setApprovalForAll` are pure overrides that revert `Soulbound()`; `_update` reverts when both `from` and `to` are non-zero. `locked(tokenId)` implements ERC-5192 and reverts `UnknownToken` for unminted ids. `tokenURI` returns base64 JSON with attributes and an inline SVG containing the seal and token number.

Deployment: `contracts/ignition/modules/VesperSigils.ts`, run via `npm run deploy:baseSepolia` (or `base`/`sepolia`). Environment: `BASE_RPC_URL`, `DEPLOYER_PRIVATE_KEY`; never committed. The deploy script prints the address and the `VITE_SIGIL_CONTRACT` / `VITE_CHAIN_ID` values to configure the frontend.

## On-Chain Mint (Client)

Minting is an optional action on the return screen:

1. Require a stored attestation and `hasConfiguredContract`.
2. Require an injected wallet on the configured chain; a local keeper cannot send transactions.
3. Call `mint(vigilStruct, signature)` through a viem wallet client.
4. Wait for the receipt, persist `{ txHash, chainId, contract }`, and show the explorer link.
5. If the registry is unconfigured, render an explanatory disabled state; if the call reverts, map the custom error to plain language.

The minted record keeps its off-chain attestation; the token is additional evidence, not a replacement.

## Threat Model

| Threat | Mitigation |
| --- | --- |
| Forged archive | Signature covers id/keeper/start/duration/seal; seal covers the record; CLI verifier checks both. |
| Replay on another chain | EIP-712 domain includes chain id; optional `verifyingContract` binds to one registry. |
| Replay of a signature with a different duration | Duration is inside the signed struct and validated 1–600 on-chain. |
| Edited archive after signing | Seal recomputation flags altered records. |
| Duplicate mint | `_tokenOfSigil` check; `AlreadySealed`. |
| Transfer or sale | Soulbound overrides on every transfer and approval path. |
| Stolen local key | Warning at creation, no key display, no export; threat is limited to signing fake vigils, not funds. |
| Malicious client | Contract re-verifies the signature; it does not trust the app. |
| Compromised frontend | Static hosting is replaceable; proofs remain verifiable with the CLI and on-chain. |

## Testing Strategy

- **Contract tests (9):** identity, mint + event, tokenURI JSON/SVG, duplicate, wrong keeper, forged key, validation, soulbound (transfers/approve/setApprovalForAll), `locked`/`UnknownToken`.
- **Unit tests:** sign → verify for local and simulated injected-shaped data; tampered message; wrong keeper; malformed fields; deterministic seal.
- **Manual/E2E:** create local keeper, sign a completed vigil, verify badge, export, run the CLI verifier on the archive.
- **Deployment smoke test:** deploy to Base Sepolia, mint one signed vigil, read `tokenURI`, attempt a transfer and expect `Soulbound`.

## Security Notes

This contract is not audited. It has no owner, no upgrade path, no mint fee, and no withdrawal function. `startedAt` is a string solely to mirror the signed payload; it is validated but not interpreted on-chain. Signing is always opt-in; no flow requests a seed phrase or `eth_sign`.
