const prompt = (process.env.USER_PROMPT ?? (await readStdin())).trim();
const risky =
  /\b(deploy|publish|release|push|tag|pages|vercel|netlify|mainnet|production)\b/i.test(prompt) &&
  /\b(now|go ahead|do it|please|should|when|how|ready|approve|approved)\b/i.test(prompt);

if (risky) {
  console.log(
    [
      "Reminder from project steering:",
      "- Do not push, create repositories, enable Pages, tag releases, deploy contracts, or post externally without explicit user approval.",
      "- Never commit secrets; review staged files before any commit.",
      "- Deployed contract changes require tests, a build, and a stated network + address in the response.",
      "- Verify the live URL and offline reload after any hosting change.",
    ].join("\n"),
  );
}

process.exit(0);

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
