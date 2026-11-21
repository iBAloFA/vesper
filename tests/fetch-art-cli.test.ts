import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ART_DISCRIMINATOR_HEX,
  ART_HEADER_LENGTH,
  OUTCOME_KEPT,
  SIGIL_ACCOUNT_LENGTH,
  SIGIL_DISCRIMINATOR_HEX,
  deriveSigilAddresses,
} from "../src/lib/proof/registry";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PROGRAM = "94gY7rp5wE4mDEEKs5sKY7oKeiVa5nHoRTDbL1Gu5erX";
const SIGIL_ID = "561fddc0".padEnd(64, "0");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>';
const ART = new TextEncoder().encode(SVG);
const ART_HASH = createHash("sha256").update(ART).digest("hex");

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function sigilAccount(artHash = ART_HASH): Uint8Array {
  const data = new Uint8Array(SIGIL_ACCOUNT_LENGTH);
  const view = new DataView(data.buffer);
  data.set(hexToBytes(SIGIL_DISCRIMINATOR_HEX), 0);
  data.set(hexToBytes(SIGIL_ID), 8);
  data.fill(1, 40, 72);
  data.set(hexToBytes("33".repeat(32)), 72);
  data.set(hexToBytes("44".repeat(32)), 104);
  data.set(hexToBytes(artHash), 136);
  view.setUint32(168, ART.length, true);
  view.setUint16(172, 25, true);
  view.setUint32(174, 1500, true);
  data[178] = OUTCOME_KEPT;
  view.setBigInt64(179, 1_763_700_000n, true);
  data.fill(2, 188, 220);
  return data;
}

function artAccount(bytes: Uint8Array): Uint8Array {
  const data = new Uint8Array(ART_HEADER_LENGTH + bytes.length);
  data.set(hexToBytes(ART_DISCRIMINATOR_HEX), 0);
  new DataView(data.buffer).setUint32(8, bytes.length, true);
  data.set(bytes, ART_HEADER_LENGTH);
  return data;
}

interface Stub {
  server: Server;
  rpc: string;
  requests: string[];
}

async function startStub(accounts: Map<string, Uint8Array>): Promise<Stub> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const payload = JSON.parse(body) as { params: [string] };
      const address = payload.params[0];
      requests.push(address);
      const data = accounts.get(address);
      const value = data
        ? {
            owner: PROGRAM,
            data: [Buffer.from(data).toString("base64"), "base64"],
            executable: false,
            lamports: 1,
            rentEpoch: 0,
          }
        : null;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { server, rpc: `http://127.0.0.1:${port}`, requests };
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runScript(args: string[]): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
        join(ROOT, "scripts", "fetch-art.ts"),
        ...args,
      ],
      { cwd: ROOT },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("scripts/fetch-art.ts", () => {
  const stubs: Stub[] = [];
  let stub: Stub;
  let sigilAddress: string;
  let artAddress: string;
  let workdir: string;

  beforeAll(async () => {
    workdir = await mkdtemp(join(tmpdir(), "vesper-fetch-art-"));
    const addresses = await deriveSigilAddresses(PROGRAM, SIGIL_ID);
    sigilAddress = addresses.sigil;
    artAddress = addresses.art;
    stub = await startStub(
      new Map([
        [sigilAddress, sigilAccount()],
        [artAddress, artAccount(ART)],
      ]),
    );
    stubs.push(stub);
  }, 60_000);

  afterAll(() => {
    for (const running of stubs) running.server.close();
  });

  it("writes the SVG and metadata when the art matches the record", async () => {
    const svgPath = join(workdir, "sigil.svg");
    const metadataPath = join(workdir, "sigil.json");
    const run = await runScript([
      "--sigil",
      SIGIL_ID,
      "--program",
      PROGRAM,
      "--rpc",
      stub.rpc,
      "--out",
      svgPath,
      "--metadata",
      metadataPath,
      "--json",
    ]);
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(await readFile(svgPath, "utf8")).toBe(SVG);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as {
      name: string;
      image: string;
      external_url: string;
    };
    expect(metadata.name).toBe("Vesper Sigil");
    expect(metadata.image).toBe(`data:image/svg+xml;base64,${Buffer.from(ART).toString("base64")}`);
    expect(metadata.external_url).toContain(`#/sigil/${SIGIL_ID}`);
    expect(run.stdout).toContain("matches the record");
    expect(run.stdout).toContain(sigilAddress);
    expect(run.stdout).toContain("sealed");
    expect(JSON.parse(run.stdout.slice(run.stdout.indexOf("{")))).toMatchObject({
      sigilId: SIGIL_ID,
    });
  }, 120_000);

  it("refuses art whose bytes do not hash to the record, writing nothing", async () => {
    const drifted = await startStub(
      new Map([
        [sigilAddress, sigilAccount("00".repeat(32))],
        [artAddress, artAccount(ART)],
      ]),
    );
    stubs.push(drifted);
    const svgPath = join(workdir, "mismatch.svg");
    const run = await runScript([
      "--sigil",
      SIGIL_ID,
      "--program",
      PROGRAM,
      "--rpc",
      drifted.rpc,
      "--out",
      svgPath,
    ]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("do not hash to the record");
    await expect(stat(svgPath)).rejects.toThrow();
  }, 120_000);

  it("fails when the cluster knows no such sigil", async () => {
    const svgPath = join(workdir, "missing.svg");
    const run = await runScript([
      "--sigil",
      "00".repeat(32),
      "--program",
      PROGRAM,
      "--rpc",
      stub.rpc,
      "--out",
      svgPath,
    ]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("knows no sigil account");
    await expect(stat(svgPath)).rejects.toThrow();
  }, 120_000);

  it("rejects a malformed sigil id before touching the network", async () => {
    const before = stub.requests.length;
    const run = await runScript(["--sigil", "deadbeef", "--program", PROGRAM, "--rpc", stub.rpc]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("32 bytes of hex");
    expect(stub.requests.length).toBe(before);
  }, 120_000);
});
