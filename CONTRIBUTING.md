# Contributing to Vesper

Vesper is a small, opinionated app. Contributions are welcome when they keep the ritual quiet and the proof honest.

## Setup

```bash
npm ci
npm run dev        # http://localhost:5173
```

Node 20 or newer. The app has no backend and needs no environment variables to run. Copy `.env.example` to `.env` only if you need a custom contract address, chain, or repository URL.

Contracts:

```bash
cd contracts
npm ci
npx hardhat build
npm test
```

## Before opening a pull request

Run the gates and make sure they pass:

```bash
npm run typecheck
npm test
npm run build
```

For contract changes:

```bash
npm --prefix contracts test
npx --prefix contracts tsc --noEmit
```

If you touched UI, verify it in a browser at 320 px and desktop width: begin a vigil, pause/resume, finish, seal with a local keeper, and reload to confirm persistence. Check the console for errors and confirm no third-party requests appear.

## Project rules

- **No backend.** All state stays in the browser. No analytics, no remote fonts, no telemetry.
- **The clock is the source of truth.** Timer logic derives from `targetEnd`; do not count intervals.
- **Keep pure logic in `src/lib`.** UI components should not own domain rules.
- **Honest proof.** Never label a record verified before signer recovery succeeds.
- **No escape hatches in the contract.** No owner, proxy, burn, upgrade, or transfer path.
- **Do not commit secrets.** Never add `.env`, keys, or RPC credentials. Deployment scripts read the environment.
- **Do not fabricate Kiro evidence.** Screenshots in `docs/kiro-evidence/` must come from the real session.

## Specs and steering

Behaviour changes should start in `.kiro/specs/`. Update the requirement first, then the design if invariants or failure modes change, then the task list. Steering in `.kiro/steering/` describes voice, stack, structure, design, and security rules; read the relevant files before editing.

## Commit style

Short imperative subjects. Explain the why in the body when it is not obvious. Keep commits focused; avoid mixing formatting churn with behaviour changes.

## Licence

By contributing, you agree that your work is licensed under the MIT License in [`LICENSE`](LICENSE).
