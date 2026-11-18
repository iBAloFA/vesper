# Vesper Sigils — soulbound registry

`VesperSigils` is an optional on-chain record for vigils kept in [Vesper](../README.md). The web app verifies EIP-712 signatures locally; this contract exists for keepers who want the same attestation to live on-chain as a non-transferable ERC-721.

## How a sigil becomes a token

1. The keeper signs the vigil off-chain with EIP-712 typed data:

   ```text
   domain: { name: "Vesper", version: "1", chainId, verifyingContract }
   Vigil(bytes32 id, address keeper, string startedAt, uint32 durationMin, bytes32 seal)
   ```

2. The keeper calls `mint(vigil, signature)` from the same address. The contract recomputes the digest, recovers the signer, and rejects anything that does not match.
3. One token per vigils id. The token is bound to the keeper forever: transfers, `approve`, and `setApprovalForAll` revert.
4. `tokenURI` is fully on-chain. It returns base64 JSON with the seal, duration, start time, and an SVG built from the seal.

`seal` is the keccak256 hash the app computes over the vigil record (`vesper.seal.v1|...`). The registry stores it; it does not try to recompute off-chain focus data.

## Layout

```text
contracts/VesperSigils.sol     the registry (OpenZeppelin ERC721 + EIP712)
test/VesperSigils.ts           viem + node:test suite
ignition/modules/              Hardhat Ignition deployment module
scripts/deploy.ts              plain deploy script
```

## Commands

```bash
npm install
npm test                  # compile + run the suite on an in-memory chain
npm run typecheck         # compile, then type-check tests and scripts
```

Deploy to Base Sepolia first, then Base:

```bash
cp .env.example .env      # fill in RPC URLs and DEPLOYER_PRIVATE_KEY
npm run deploy:baseSepolia
npm run deploy:base
```

Ignition writes deployment data to `ignition/deployments/<network>/`. Set the app build variables to match:

```bash
VITE_SIGIL_CONTRACT=0x… VITE_CHAIN_ID=8453 npm run build --prefix ..
```

## Verification

After deploying, verify the source so anyone can read the registry:

```bash
npx hardhat verify --network base <address>
```

Add `BASESCAN_API_KEY` to `.env` first.

## Security notes

- Signatures are bound to the deployed contract address through the EIP-712 domain, so an attestation for one registry cannot be replayed into another.
- The contract never holds funds, has no owner, and no admin functions.
- `startedAt` must be a digit-only timestamp string (≤ 20 characters) so it is safe inside on-chain JSON.
- The token is permanently locked; there is no burn or escape hatch. Treat minting as final.
- This code has not been audited. It is a small, self-contained registry — read it before deploying it with value at stake.
