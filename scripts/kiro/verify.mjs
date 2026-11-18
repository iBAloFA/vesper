import { spawnSync } from "node:child_process";

const steps = [
  ["npm", ["run", "typecheck"]],
  ["npm", ["test"]],
  ["npm", ["--prefix", "contracts", "test"]],
];

for (const [command, args] of steps) {
  const label = `${command} ${args.join(" ")}`;
  process.stdout.write(`\n[kiro] ${label}\n`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.stderr.write(`\n[kiro] ${label} failed with exit code ${result.status ?? "unknown"}.\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("\n[kiro] Typecheck and all tests passed.\n");
