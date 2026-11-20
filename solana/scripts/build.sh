#!/usr/bin/env bash
# Build the Vesper sigil program and run its host tests.
# CI-friendly: no interactive prompts, fails on anything unexpected.
#
# Two toolchain quirks are handled here. Anchor 0.31.3 still passes the legacy
# `v3` arch name, which Agave 4 renamed `sbfv1`, so the SBF build is invoked
# directly instead of via `anchor build`. And platform-tools v1.53+ ship only
# `sbpf-*` targets while the cargo-build-sbf bundled with Agave 4.4 asks for
# `sbf-solana-solana`, so v1.52 is pinned (override with SOLANA_PLATFORM_TOOLS).
# Agave 4.4 also remapped the arch names: its `sbfv1` alias now selects SBPFv3,
# which rejects v1.52, and `v0` is the legacy target that consumes it. Older
# CLIs only know `sbfv1`/`sbfv2`, so the arch is chosen from `--help`.
set -euo pipefail
cd "$(dirname "$0")/.."

arch=v0
if ! cargo-build-sbf --help 2>&1 | grep -qw v0; then
  arch=sbfv1
  cargo-build-sbf --help 2>&1 | grep -q sbfv1 || arch=v3
fi
tools="${SOLANA_PLATFORM_TOOLS:-v1.52}"

mkdir -p target/deploy
cargo-build-sbf \
  --manifest-path programs/vesper-sigil/Cargo.toml \
  --arch "$arch" \
  --tools-version "$tools" \
  --sbf-out-dir "$PWD/target/deploy"
anchor=anchor
command -v anchor-0.31.3 >/dev/null 2>&1 && anchor=anchor-0.31.3
if ! command -v "$anchor" >/dev/null 2>&1 && [ -x "$HOME/.avm/bin/anchor-0.31.3" ]; then
  anchor="$HOME/.avm/bin/anchor-0.31.3"
fi
"$anchor" idl build
cargo test --workspace
