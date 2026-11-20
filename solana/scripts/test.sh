#!/usr/bin/env bash
# Program integration suite. Starts a fresh local validator serving the built
# program, then drives mint, chunked art and the Requiem Ledger from
# solana/tests/mint-release.ts with the app's own encoders.
#
# Build first with solana/scripts/build.sh. Run from anywhere.
set -euo pipefail

cd "$(dirname "$0")/.."
repo="$(cd ../.. && pwd)"
so="target/deploy/vesper_sigil.so"
program="$(grep -o 'declare_id!("[^"]*")' programs/vesper-sigil/src/lib.rs | head -1 | sed 's/.*"\(.*\)".*/\1/')"
rpc="${SOLANA_RPC:-http://127.0.0.1:8899}"
ledger="${VESPER_TEST_LEDGER:-/tmp/vesper-test-ledger}"

if [ ! -f "$so" ]; then
  echo "No $so yet; run solana/scripts/build.sh first." >&2
  exit 1
fi

pkill -f solana-test-validator >/dev/null 2>&1 || true
sleep 2
# Agave 4.4 refuses to start without a default signer; older releases made one.
if [ ! -f "$HOME/.config/solana/id.json" ]; then
  mkdir -p "$HOME/.config/solana"
  solana-keygen new --no-bip39-passphrase -s -o "$HOME/.config/solana/id.json" >/dev/null
fi
solana-test-validator --reset --quiet --ledger "$ledger" --bind-address 0.0.0.0 \
  --bpf-program "$program" "$PWD/$so" >/tmp/vesper-validator.log 2>&1 &
validator=$!
trap 'kill "$validator" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  if solana -u "$rpc" cluster-version >/dev/null 2>&1; then break; fi
  sleep 1
done
solana -u "$rpc" program show "$program" >/dev/null

cd "$repo"
SOLANA_RPC="$rpc" npx tsx solana/tests/mint-release.ts
