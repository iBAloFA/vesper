# Proof of Focus — Web3 Design

Vesper's sigils are records first and tokens second. The design gives a keeper two independent ways to prove a vigil:

1. **Off-chain (default):** an EIP-712 signature stored beside the vigil. Anyone can recover the signer and recompute the seal with viem or the included Node verifier.
2. **On-chain (opt-in):** a soulbound ERC-721 that re-verifies the same signature and permanently binds the seal to the keeper's address.

The app never needs a wallet to function, and an unconfigured build never pretends that on-chain minting exists.

## What is signed

```
domain = {
  name: "Vesper",
  version: "1",
  chainId: 8453,                 // Base by default; configurable
  verifyingContract?: 0x…        // set when a registry is configured
}

Vigil {
  bytes32 id          // keccak256(utf8(vigil.id))
  address keeper      // signer and, on-chain, msg.sender
  string  startedAt   // decimal milliseconds, digits only
  uint32  durationMin // 1..600
  bytes32 seal        // keccak256 of the canonical record
}
```

The **seal** is computed over:

```
vesper.seal.v1|id|startedAt|endedAt|plannedMin|focusedSec|completed|intention|ambience
```

`completed` is the literal `completed` or `released`. Because the seal covers every meaningful field, editing the archive after signing invalidates it. Because the signature covers the seal, changing the seal invalidates the signature.

### Why `startedAt` is a string

Solidity's ABI encodes `uint256` differently from JavaScript numbers at the edges, and JSON numbers above 2^53 lose precision. The contract stores `string startedAt` and the client signs the decimal string. The value is validated as 1–20 digits on-chain and by the verifier, so malformed input cannot slip through.

## Off-chain attestation

```ts
interface StoredAttestation {
  address: `0x${string}`;
  chainId: number;
  kind: "local" | "injected";
  signature: `0x${string}`;
  signedAt: number;
  domain: { name: "Vesper"; version: "1"; chainId: number; verifyingContract?: `0x${string}` };
  message: { id; keeper; startedAt: string; durationMin: number; seal };
}
```

Signing paths:

- **Local keeper** — viem `generatePrivateKey` + `signTypedData`. The key lives only in `vesper.wallet.v1`; it is never displayed again, exported, or transmitted.
- **Browser wallet** — `eth_signTypedData_v4` with the same payload. The app checks the address, chain, and 65-byte signature.

Verification in the app runs `recoverTypedDataAddress` with the stored domain and message. Any throw is a failure. The crypt counts a record as signed only when an attestation exists; the detail view shows whether recovery actually succeeds.

## Independent verification

```bash
npm run verify:attestation -- vesper-archive-2026-11-18.json
```

The verifier imports viem directly and shares no code with the app. It:

1. Accepts a single attestation or a full archive.
2. Validates addresses, 32-byte hashes, 65-byte signatures, digit-only timestamps, and durations.
3. Recovers the signer and compares it to the declared keeper.
4. Recomputes each archive seal and reports a mismatch.
5. Exits `1` if anything fails; `0` only when every attestation verifies.

Sample report shape:

```
Vigil 0x54fcd38715…
  keeper      0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  chain       84532
  signature   ✓ recovers to the keeper
  seal        ✓ matches the record
  duration    25 min
  startedAt   1763000000000

✓ 1 of 1 attestations verified. No Vesper code was trusted.
```

## Soulbound registry

`contracts/contracts/VesperSigils.sol` — Solidity 0.8.34, OpenZeppelin 5.6.

| Function | Behaviour |
| --- | --- |
| `mint(Vigil, bytes signature)` | Validates, recovers, mints token `++totalSupply`, emits `SigilSealed`. |
| `tokenOfSigil(bytes32)` | Token id for a sigil, or 0. |
| `sealOf` / `durationOf` / `startedAtOf` | Public per-token metadata. |
| `locked(uint256)` | ERC-5192; `true` for every existing token, `UnknownToken` otherwise. |
| `tokenURI(uint256)` | Base64 JSON with attributes and an inline SVG. |
| `approve` / `setApprovalForAll` | Always revert `Soulbound()`. |
| transfers | Revert `Soulbound()` through `_update`. |

Custom errors: `AlreadySealed(bytes32)`, `KeeperMismatch`, `InvalidSeal`, `InvalidDuration`, `InvalidStartedAt`, `Soulbound`, `UnknownToken(uint256)`.

There is no owner, proxy, burn, upgrade, or withdrawal path. The contract cannot alter a minted record.

### On-chain metadata

`tokenURI` embeds name, description, `Seal`, `Duration`, `Started`, `Soulbound`, and an SVG rendering of the seal. It resolves without any external host.

## Deployment

```bash
cd contracts
cp .env.example .env          # add RPC URL + deployer key locally
npm run deploy:baseSepolia
```

The Ignition module prints the address. Configure the frontend:

```
VITE_SIGIL_CONTRACT=0x…
VITE_CHAIN_ID=84532
```

Notes:

- The deployer key must hold gas on the target chain. Never commit it.
- Base mainnet chain id is 8453; Sepolia is 11155111.
- Minting requires an injected wallet on the configured chain. Local keepers can sign but cannot send transactions.
- The address is bound into new attestations through `verifyingContract`; old attestations remain valid under the domain they signed.

## Threat model

| Threat | Defence |
| --- | --- |
| Forged record | Signature + seal must both verify; CLI verifier is independent. |
| Archive edited later | Seal recomputation flags it. |
| Replay on a different chain | Domain chain id. |
| Replay against a different registry | `verifyingContract` in the domain. |
| Duplicate mint | `_tokenOfSigil` + `AlreadySealed`. |
| Transfer or sale | Soulbound on every path. |
| Stolen local key | No key display/export; the key can only sign fake vigils, not move funds. |
| Malicious frontend | Contract re-verifies; proofs are checkable without the app. |

## Limitations

- **Not audited.** The contract ships with nine tests and a clear invariant set, not a security guarantee.
- Testnet deployment is manual and optional; the default build has no registry configured.
- The app trusts the browser clock for `startedAt`. A determined user can fabricate a vigil and sign it; the proof says "this keeper signed this record", not "this record is physically true".
- No revocation. Attestations are immutable files; deleting the local record does not invalidate an exported signature.

## Tests

```
cd contracts
npm test
```

Nine cases cover identity, mint and event, tokenURI decoding, duplicate sealing, keeper mismatch, forged signatures, validation errors, soulbound transfers/approvals, and `locked`/`UnknownToken`. The app-side signer/verifier path is covered by unit tests at the repository root.
