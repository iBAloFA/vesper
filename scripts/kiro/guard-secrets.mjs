const input = await readStdin();
const event = parse(input);
const tool = typeof event.tool_name === "string" ? event.tool_name : "";
const toolInput = isRecord(event.tool_input) ? event.tool_input : {};

const paths = collectPaths(toolInput);
const command = typeof toolInput.command === "string" ? toolInput.command : "";

for (const path of paths) {
  const normalised = path.replace(/\\/g, "/");
  const name = normalised.split("/").pop() ?? normalised;
  const isEnv = name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
  if (isEnv) {
    block(`Refusing to write ${path}. Environment files hold secrets; edit them yourself outside the agent.`);
  }
  if (/(^|\/)\.git\//.test(normalised)) {
    block(`Refusing to write ${path}. Git internals are managed by git, not by the agent.`);
  }
  if (/\.(pem|p12|pfx|keystore)$/i.test(name)) {
    block(`Refusing to write ${path}. Key material must never be generated into the workspace.`);
  }
}

if (tool === "shell" || /shell|command|exec|terminal/i.test(tool)) {
  const patterns = [
    { re: /\b(cat|less|more|head|tail|type|Get-Content)\b[^\n]*?(^|[\s"'/\\])\.env(\.(?!example)[\w.-]+)?(?=$|[\s"';&|])/i, why: "reading .env files" },
    { re: /\bgit\s+add\b[^\n]*\.env(?!\.example)/i, why: "staging .env files" },
    { re: /\b(git\s+push|gh\s+release|gh\s+repo\s+edit|npm\s+publish|vercel\s+deploy|netlify\s+deploy)\b/i, why: "publishing or deploying (requires explicit user approval)" },
    { re: /\bhardhat\s+ignition\s+deploy\b[^\n]*--network\s+(base|mainnet|sepolia)\b/i, why: "deploying contracts to a live network" },
    { re: /\b(--no-verify|--force\s+push|push\s+--force)\b/i, why: "bypassing git safeguards" },
  ];
  for (const { re, why } of patterns) {
    if (re.test(command)) {
      block(`Blocked by Vesper guard: ${why}. Ask the user for explicit approval, then run it yourself.`);
    }
  }
}

process.exit(0);

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function collectPaths(value, out = []) {
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      if (/path|file|target|destination/i.test(key)) out.push(entry);
    } else if (Array.isArray(entry)) {
      for (const item of entry) {
        if (typeof item === "string" && /path|file|target/i.test(key)) out.push(item);
        else if (isRecord(item)) collectPaths(item, out);
      }
    } else if (isRecord(entry)) {
      collectPaths(entry, out);
    }
  }
  return out;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse(text) {
  try {
    const value = JSON.parse(text);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

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
