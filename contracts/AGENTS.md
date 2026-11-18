# Hardhat + viem project — VesperSigils

## Project layout

```
contracts/        VesperSigils.sol (soulbound ERC-721 registry)
test/             TypeScript tests (node:test + toolbox-viem)
ignition/         Ignition deployment module
scripts/          Standalone deploy script
hardhat.config.ts
```

## Working in this project

When writing or modifying tests, configuring `hardhat.config.ts`, or interacting with the network from TypeScript, invoke the **`hardhat`** skill. It covers Solidity and TypeScript testing, how to choose between them, `network.create()`, `networkHelpers`, and the compile-then-typecheck workflow. Load the companion **`hardhat-toolbox-viem`** skill for typed contract calls and `viem.assertions`.

## Vesper invariants

- EIP-712 domain: `("Vesper", "1")`, chain-bound by deployment.
- Typehash: `Vigil(bytes32 id,address keeper,string startedAt,uint32 durationMin,bytes32 seal)`.
- `startedAt` is a digit-only decimal string; `durationMin` is 1–600; `seal` is non-zero.
- Mint is once per `sigilId`; `msg.sender` must be the keeper and the signature must recover to the keeper.
- Soulbound: `approve`, `setApprovalForAll`, and every transfer revert `Soulbound()`. Do not add an escape hatch.
- No owner, proxy, burn, or upgrade path. Keep `tokenURI` self-contained (base64 JSON + inline SVG).

## Commands

```
npx hardhat build        # compile and generate types
npx tsc --noEmit         # typed tests and config
npm test                 # hardhat test (node:test)
npm run deploy:baseSepolia
```

Deployment reads `BASE_SEPOLIA_RPC_URL` (or `BASE_RPC_URL` / `SEPOLIA_RPC_URL`) and `DEPLOYER_PRIVATE_KEY` from the environment. Never write a key into a tracked file; never log it.

## Docs

- Hardhat 3 — https://hardhat.org/llms.txt
- viem — https://viem.sh/llms.txt
- OpenZeppelin 5 — https://docs.openzeppelin.com/contracts/5.x/
