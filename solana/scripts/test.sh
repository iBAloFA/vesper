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
# Agave 4.2+ enables XDP by default and exits(1) without CAP_NET_ADMIN, which
# CI containers do not grant; --no-xdp is the documented fallback there.
extra=()
if solana-test-validator --help 2>&1 | grep -q -- '--no-xdp'; then
  extra+=("--no-xdp")
fi
solana-test-validator --reset --ledger "$ledger" --bind-address 0.0.0.0 \
  --bpf-program "$program" "$PWD/$so" ${extra[@]+"${extra[@]}"} >/tmp/vesper-validator.log 2>&1 &
validator=$!
trap 'kill "$validator" >/dev/null 2>&1 || true' EXIT

ready=0
for _ in $(seq 1 60); do
  if solana -u "$rpc" cluster-version >/dev/null 2>&1; then ready=1; break; fi
  kill -0 "$validator" 2>/dev/null || break
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "The validator never answered on $rpc." >&2
  if kill -0 "$validator" 2>/dev/null; then
    echo "It was still running; stopping it to read its status." >&2
    kill "$validator" 2>/dev/null || true
  fi
  code=0
  wait "$validator" 2>/dev/null || code=$?
  echo "Validator exit status: $code." >&2
  tail -n 30 /tmp/vesper-validator.log >&2 || true
  echo "--- $ledger/validator.log" >&2
  tail -n 40 "$ledger/validator.log" >&2 || true
  exit 1
fi

# The RPC answers before the program is loaded; wait for the account itself.
loaded=0
for _ in $(seq 1 60); do
  if solana -u "$rpc" account "$program" >/dev/null 2>&1; then loaded=1; break; fi
  sleep 1
done
if [ "$loaded" -ne 1 ]; then
  echo "The program $program never appeared on the validator." >&2
  tail -n 30 /tmp/vesper-validator.log >&2 || true
  echo "--- $ledger/validator.log" >&2
  tail -n 40 "$ledger/validator.log" >&2 || true
  exit 1
fi

cd "$repo"
SOLANA_RPC="$rpc" npx tsx solana/tests/mint-release.ts
