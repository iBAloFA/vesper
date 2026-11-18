import { execFileSync } from "node:child_process";

const postCompact = process.argv.includes("--post-compact");

if (postCompact) {
  console.log(
    [
      "Vesper invariants after compaction:",
      "- Timer truth is absolute `targetEnd`, never a decrementing counter.",
      "- Never claim a vigil is signed/sealed/verified unless the signature recovers to the keeper and the seal matches.",
      "- `startedAt` is a decimal string in EIP-712 and on-chain; duration is 1-600.",
      "- No secrets in the repo; no push/deploy/release without explicit user approval.",
      "- Gates: npm run typecheck, npm test, npm run build; contracts: npx tsc --noEmit, npm test.",
      "- Verification is browser-based; typechecks do not prove a feature works.",
    ].join("\n"),
  );
  process.exit(0);
}

const lines = ["Vesper workspace brief:"];

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const last = git(["log", "-1", "--pretty=%h %s"]);
const dirty = git(["status", "--porcelain"]);

lines.push(branch ? `- Branch: ${branch}` : "- Git: not initialised yet");
if (last) lines.push(`- Last commit: ${last}`);
if (dirty !== null) {
  const count = dirty ? dirty.split("\n").filter(Boolean).length : 0;
  lines.push(`- Working tree: ${count === 0 ? "clean" : `${count} changed path${count === 1 ? "" : "s"}`}`);
}
lines.push("- Specs: .kiro/specs/vigil-core, .kiro/specs/proof-of-focus");
lines.push("- Gates: npm run typecheck && npm test; contracts: npx tsc --noEmit && npm test");
lines.push("- Verify UI in a browser; never fabricate Kiro evidence; never push without approval.");
console.log(lines.join("\n"));

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}
