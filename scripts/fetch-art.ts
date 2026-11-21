#!/usr/bin/env node
// Reads one minted sigil and its art straight from the cluster: the Sigil
// record, the Art bytes, the hash check, and optionally an SPL metadata JSON.
// Replaces nothing in the app; it exists so anyone can retrieve and verify a
// minted sigil without trusting Vesper's interface.
import { writeFile } from "node:fs/promises";
import {
  artMatches,
  deriveSigilAddresses,
  fetchAccountData,
  normalizeSigilId,
  parseArtAccount,
  parseSigilAccount,
  recordJson,
  sigilMetadata,
  OUTCOME_RELEASED,
} from "../src/lib/proof/registry";

const DEFAULT_PROGRAM = "94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX";
const DEFAULT_RPC = "https://api.devnet.solana.com";

/** Thrown for expected refusals, so the process can exit by itself. Calling
 * process.exit() while fetch keeps a socket open trips a libuv assertion on
 * Windows (0xC0000409) instead of a clean exit code. */
class Refusal extends Error {}

function fail(message: string): never {
  throw new Refusal(message);
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} needs a value`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sigilArg = argValue(args, "--sigil");
  const program = argValue(args, "--program") ?? process.env.VITE_VESPER_PROGRAM ?? DEFAULT_PROGRAM;
  const rpc = argValue(args, "--rpc") ?? process.env.SOLANA_RPC ?? DEFAULT_RPC;
  const out = argValue(args, "--out");
  const metadataPath = argValue(args, "--metadata");

  if (!sigilArg || sigilArg === "--help" || sigilArg === "-h") {
    console.log(
      "Usage: npm run fetch:art -- --sigil <64 hex> [--program <id>] [--rpc <url>] [--out <file.svg>] [--metadata <file.json>] [--json]",
    );
    console.log("Reads the Sigil and Art accounts for a minted sigil, checks the art hash");
    console.log("against the record, and writes the SVG. --metadata also writes a JSON");
    console.log("metadata document whose image is the art itself; --json prints the record.");
    if (!sigilArg) process.exitCode = 1;
    return;
  }

  const sigilHex = normalizeSigilId(sigilArg);
  if (!sigilHex) fail("--sigil must be 32 bytes of hex (64 characters, 0x optional)");

  const addresses = await deriveSigilAddresses(program, sigilHex).catch((error: unknown) =>
    fail(error instanceof Error ? error.message : "the program id or rpc is malformed"),
  );

  let sigilAccount;
  let artAccount;
  try {
    sigilAccount = await fetchAccountData(rpc, addresses.sigil);
    artAccount = await fetchAccountData(rpc, addresses.art);
  } catch (error) {
    fail(`could not reach ${rpc} (${error instanceof Error ? error.message : "unknown error"})`);
  }

  if (!sigilAccount) {
    fail(
      `the cluster at ${rpc} knows no sigil account ${addresses.sigil}. The id may be wrong, or it was minted to another program.`,
    );
  }
  if (sigilAccount.owner !== program) {
    fail(
      `the account at ${addresses.sigil} is owned by ${sigilAccount.owner}, not by ${program}.`,
    );
  }

  const record = parseSigilAccount(sigilAccount.data);
  if (!record) fail("the account exists but does not read as a Vesper sigil record.");
  if (record.sigilId !== sigilHex) {
    fail(`the record holds sigil ${record.sigilId}, which is not the one asked for.`);
  }

  const art = artAccount ? parseArtAccount(artAccount.data) : null;
  const sealed = new Date(record.mintedAt * 1000).toISOString();
  const outcome = record.outcome === OUTCOME_RELEASED ? "released" : "kept";

  console.log(`Sigil ${record.sigilId.slice(0, 12)}…`);
  console.log(`  program    ${program}`);
  console.log(`  sigil      ${addresses.sigil}`);
  console.log(`  art        ${addresses.art}`);
  console.log(`  keeper     ${record.keeper}`);
  console.log(`  mint       ${record.mint}`);
  console.log(`  sealed     ${sealed} (as the cluster saw it)`);
  console.log(`  duration   ${record.durationMin} ${record.durationMin === 1 ? "minute" : "minutes"}`);
  console.log(`  focused    ${record.focusedSec} ${record.focusedSec === 1 ? "second" : "seconds"}`);
  console.log(`  outcome    ${outcome}`);
  console.log(`  seal       ${record.seal}`);
  console.log(`  message    ${record.messageHash}`);
  if (record.revoked) {
    console.log("  notice     a keeper-signed release exists in the ledger; the record stays on-chain");
  }

  if (!artAccount) {
    fail(`the record is on-chain but the cluster returned no art account at ${addresses.art}; reload later, or check the program id.`);
  }
  if (!art) fail(`the art account at ${addresses.art} does not read as a Vesper art record.`);

  const matches = await artMatches(record, art);
  console.log(
    `  art        ${art.length} bytes ${matches ? "✓ matches the record" : "✗ does not match the record"}`,
  );
  if (!matches) fail("the art bytes are incomplete or do not hash to the record, so nothing was written.");

  let svg: string;
  try {
    svg = new TextDecoder("utf-8", { fatal: true }).decode(art);
  } catch {
    fail("the art bytes are not valid UTF-8, so they are not an SVG.");
  }
  if (!svg.trimStart().startsWith("<svg")) {
    fail("the art bytes are not an SVG document.");
  }

  const target = out ?? `vesper-sigil-${record.sigilId.slice(0, 12)}.svg`;
  await writeFile(target, svg, "utf8");
  console.log(`\nWrote ${target} (${art.length} bytes).`);

  if (metadataPath) {
    const metadata = sigilMetadata(record, art);
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    console.log(`Wrote ${metadataPath} (metadata with the art embedded as a data URI).`);
  }

  if (args.includes("--json")) console.log(`\n${recordJson(record)}`);
}

try {
  await main();
} catch (error) {
  if (!(error instanceof Refusal)) throw error;
  console.error(`fetch-art: ${error.message}`);
  process.exitCode = 1;
}
