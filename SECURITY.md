# Security Policy

## Supported versions

Vesper is a pre-1.0 project. Security fixes land on `main`; only the latest build is supported.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1 | No |

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Use GitHub's private reporting flow:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include the affected route or contract function, reproduction steps, impact, and any suggested fix.

If private reporting is unavailable, contact the maintainer through the address on the GitHub profile and say that the report is security-sensitive. Expect an acknowledgement within a few days.

## Scope

- The client app in `src/` (storage sanitisation, wallet handling, signature verification).
- The service worker in `public/sw.js` (cache poisoning, offline integrity).
- The registry in `contracts/contracts/VesperSigils.sol` (mint-once, soulbound enforcement, metadata escaping).
- The verifier in `scripts/verify-attestation.ts`.

Out of scope: third-party wallets, GitHub Pages hosting, browser extensions, and social engineering.

## Known limitations

These are design constraints, not surprises:

- **Local keeper keys are stored unencrypted in `localStorage`.** This is a deliberate low-friction path for a ritual app, suitable for test vigils only. Do not use it with funds. Prefer a browser wallet for anything meaningful.
- **The registry has not been audited.** It is a small, immutable, ownerless contract, but unaudited code is unaudited code. Deploy to a testnet first.
- **No revocation.** An attestation is a signed statement; it cannot be un-signed. The archive is local, but an exported signature remains valid evidence that the keeper signed that record.
- **Clock trust.** The timer derives from the device clock. Sealing proves the keeper signed the record, not that the wall clock was honest.
- **No on-chain deployment in this release.** The app verifies signatures locally. Contract deployment is an operator step documented in `docs/web3-design.md`.

## Secrets

The repository must never contain private keys, RPC credentials, or `.env` files. Deployment reads `DEPLOYER_PRIVATE_KEY` and an RPC URL from the environment at run time. The `guard-secrets` hook blocks common leaks during agent work, but it is a guardrail, not a guarantee. Review staged changes before committing.
