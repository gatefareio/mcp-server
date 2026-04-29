/**
 * Stdio protocol tests — MCP frames the JSON-RPC over LSP-style headers
 * on stdout. ANY console.log() in our server code corrupts the
 * channel and the client errors out. These tests defend the contract.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_BIN = resolve(__dirname, "../dist/index.js");
const SRC_DIR = resolve(__dirname, "../src");

beforeAll(() => {
  if (!existsSync(SERVER_BIN)) {
    throw new Error("Run `npm run build` first.");
  }
});

function walkSrcFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkSrcFiles(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("stdio protocol integrity", () => {
  it("source code has no `console.log` (would corrupt stdout)", () => {
    const offenders: string[] = [];
    for (const file of walkSrcFiles(SRC_DIR)) {
      const text = readFileSync(file, "utf-8");
      // Match `console.log` not preceded by a comment marker on the line.
      // Simple grep: any line containing `console.log(` that isn't a
      // comment.
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        if (/\bconsole\.log\s*\(/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("source code has no `process.stdout.write` outside transport", () => {
    // Any direct write to stdout that isn't the MCP SDK itself would
    // collide with the JSON-RPC frames.
    const offenders: string[] = [];
    for (const file of walkSrcFiles(SRC_DIR)) {
      const text = readFileSync(file, "utf-8");
      if (/process\.stdout\.write\s*\(/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("server only writes JSON-RPC frames to stdout — no banner, no progress text", async () => {
    // Spawn raw, capture stdout, verify there's nothing before the
    // first JSON-RPC frame.
    const proc = spawn("node", [SERVER_BIN], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    proc.stdout.on("data", (d) => stdoutChunks.push(d));

    // Send an `initialize` request; capture the initial response.
    const initReq =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      }) + "\n";
    proc.stdin.write(initReq);

    // Wait until the server emits at least one frame on stdout (the
    // initialize response) — bounded by a generous deadline so a
    // broken server can't hang the test.
    await Promise.race([
      new Promise<void>((res) => {
        const check = () => {
          if (stdoutChunks.length > 0) res();
          else setTimeout(check, 50);
        };
        check();
      }),
      new Promise<void>((res) => setTimeout(res, 5000)),
    ]);
    proc.kill("SIGTERM");
    await new Promise<void>((res) => proc.on("exit", () => res()));

    const out = Buffer.concat(stdoutChunks).toString("utf-8");
    // Every line on stdout must be parseable as JSON-RPC. (MCP stdio
    // transport is newline-delimited JSON.)
    const lines = out.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const obj = JSON.parse(line);
      expect(obj.jsonrpc).toBe("2.0");
    }
  }, 5000);

  it("a tool error does NOT crash the server — subsequent calls still work", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [SERVER_BIN],
      env: {},
    });
    const client = new Client(
      { name: "test", version: "1" },
      { capabilities: {} },
    );
    await client.connect(transport);

    try {
      // Trigger a zod validation error (bad input)
      const bad = await client.callTool({
        name: "gatefare.get_api",
        arguments: {},
      });
      expect(bad.isError).toBe(true);

      // Server is still alive — listTools should work
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // Another bad call still gets a structured error, not a crash
      const bad2 = await client.callTool({
        name: "gatefare.suggest",
        arguments: { query: "" },
      });
      expect(bad2.isError).toBe(true);
    } finally {
      await client.close();
    }
  }, 10000);
});
