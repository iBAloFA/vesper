# Deployment

Vesper has two deployable pieces: the static app (GitHub Pages) and the optional soulbound registry (Hardhat Ignition). The app works without the contract.

## App: GitHub Pages

### One-time repository setup

```bash
gh auth login
gh repo create vesper --public --source=. --remote=origin --push
```

Then:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Confirm the `Deploy to GitHub Pages` workflow has `pages: write` and `id-token: write` (it does in `.github/workflows/deploy.yml`).
3. The first push to `main` triggers tests, a production build, and deployment.
4. The live URL is `https://<owner>.github.io/vesper/`.

Update the two placeholders once the URL is known:

- The **Live app** line in `README.md`.
- The Devpost submission.

The workflow injects `VITE_REPO_URL` from the repository, so in-app links resolve to the right GitHub project. No `.env` is committed.

### Optional repository variables

Set these under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Example | Effect |
| --- | --- | --- |
| `VITE_CHAIN_ID` | `84532` | Build expects Base Sepolia instead of Base mainnet. |
| `VITE_SIGIL_CONTRACT` | `0x…` | Enables the mint action in the Return view. |

Leave both unset to ship a verification-only build on Base mainnet. They are public build-time values; never put a private key in a variable or secret used by the app build.

### Custom domain

1. Add a `CNAME` file to `public/` containing the domain (it is copied into `dist/`).
2. Configure the DNS record GitHub shows in **Settings → Pages**.
3. Re-run the workflow.

Vite's `base: "./"` and hash routing work at the domain root and under a project subpath.

### Rollback

Pages serves the last successful artifact. To roll back, revert the offending commit on `main` (or use **Actions → Deploy to GitHub Pages → Re-run** on an earlier successful run). There is no separate hosting state to clean up.

## Contract: Base Sepolia (optional)

The registry is unaudited. Deploy to a testnet first.

```bash
cd contracts
npm ci

export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"
export DEPLOYER_PRIVATE_KEY="0x…"   # never commit this; never paste it into an agent prompt
npm run deploy:baseSepolia
```

The deploy script reads `BASE_SEPOLIA_RPC_URL` (or `BASE_RPC_URL` / `SEPOLIA_RPC_URL`) and `DEPLOYER_PRIVATE_KEY`. It validates the key, prints the deployer address, and deploys through Ignition. It never writes the key to disk.

After deployment:

1. Copy the contract address.
2. Set the `VITE_SIGIL_CONTRACT` repository variable to that address.
3. Set `VITE_CHAIN_ID` to `84532`.
4. Re-run the Pages workflow.

For mainnet, the equivalent is `npm run deploy:base` with `BASE_RPC_URL` and a funded deployer. Do not skip the testnet step.

## Verification checklist

After any deploy:

- [ ] The live URL loads over HTTPS with no console errors.
- [ ] A vigil can be started, paused, resumed, finished and released.
- [ ] Reloading mid-vigil restores the correct remaining time.
- [ ] Sound is off by default and starts only after the sound control is pressed.
- [ ] A sealed vigil shows **verified** only after signer recovery; an unsigned vigil does not.
- [ ] Archive export produces a file that `npm run verify:attestation` accepts.
- [ ] The app works offline after one full load (DevTools → Network → Offline).
- [ ] No third-party network requests are made.
- [ ] At 320 px the layout has no horizontal scroll; controls remain reachable.
- [ ] If minting is enabled, the network matches and the mint transaction reaches the registry.

Record the deployed commit, URL, contract address, chain, and date in the release notes or the submission draft.
