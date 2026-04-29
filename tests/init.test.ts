/**
 * Init / bootstrap tests — exercise the entry point as the OS would
 * run it: spawn `node dist/index.js`, write/read stdin/stdout, verify
 * the server stays up and responds. Catches stdout pollution, env
 * parsing crashes, and signal handling regressions.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_BIN = resolve(__dirname, "../dist/index.js");

beforeAll(() => {
  if (!existsSync(SERVER_BIN)) {
    throw new Error(
      `Built server not found at ${SERVER_BIN}. Run \`npm run build\` first.`,
    );
  }
});

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

/**
 * Spawn the server and wait for it to exit naturally — used for
 * "should crash on bad config" tests. Kills with SIGTERM after
 * `killAfterMs` if it doesn't exit on its own (defensive timeout).
 */
function spawnUntilExit(env: Record<string, string>, killAfterMs = 8000): Promise<ProcessResult> {
  return new Promise((resolveResult) => {
    const proc = spawn("node", [SERVER_BIN], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    const timer = setTimeout(() => proc.kill("SIGTERM"), killAfterMs);

    proc.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolveResult({ stdout, stderr, exitCode: code, signal });
    });
  });
}

/**
 * Spawn the server, let it boot for `runForMs`, then SIGTERM. Used
 * for "should stay running" / capability detection tests where the
 * server enters its stdio read loop and stays alive.
 */
function spawnRunning(env: Record<string, string>, runForMs = 1500): Promise<ProcessResult> {
  return new Promise((resolveResult) => {
    const proc = spawn("node", [SERVER_BIN], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    setTimeout(() => proc.kill("SIGTERM"), runForMs);

    proc.on("exit", (code, signal) => {
      resolveResult({ stdout, stderr, exitCode: code, signal });
    });
  });
}

describe("init / bootstrap", () => {
  it("starts cleanly with no env (discovery + safety only) and writes nothing to stdout", async () => {
    const r = await spawnRunning({}, 1500);

    // STDOUT must be empty when no MCP client is talking — otherwise
    // any frame the server emits without a request would corrupt the
    // protocol on the client side.
    expect(r.stdout).toBe("");

    // STDERR should contain a startup banner with the capabilities.
    expect(r.stderr).toContain("[gatefare-mcp]");
    expect(r.stderr).toContain("discovery");
    expect(r.stderr).toContain("safety");
    expect(r.stderr).not.toContain("buyer");
    expect(r.stderr).not.toContain("publisher");
  }, 8000);

  it("advertises buyer capability when WALLET_PRIVATE_KEY is set", async () => {
    const r = await spawnRunning(
      { WALLET_PRIVATE_KEY: "0x" + "a".repeat(64) },
      1500,
    );
    expect(r.stderr).toContain("buyer");
    expect(r.stdout).toBe("");
  }, 8000);

  it("advertises publisher capability when GATEFARE_PAT is set", async () => {
    const r = await spawnRunning({ GATEFARE_PAT: "gfpat_test" }, 1500);
    expect(r.stderr).toContain("publisher");
    expect(r.stdout).toBe("");
  }, 8000);

  it("crashes loudly on malformed WALLET_PRIVATE_KEY", async () => {
    const r = await spawnUntilExit({ WALLET_PRIVATE_KEY: "0xshort" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("32-byte hex string");
  }, 10_000);

  it("crashes on PAT without gfpat_ prefix", async () => {
    const r = await spawnUntilExit({ GATEFARE_PAT: "wrong-prefix" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("gfpat_");
  }, 10_000);

  it("crashes on invalid network", async () => {
    const r = await spawnUntilExit({ WALLET_NETWORK: "eip155:1" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("eip155:8453");
  }, 10_000);

  it("crashes on negative budget", async () => {
    const r = await spawnUntilExit({ WALLET_BUDGET_USD: "-5" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("non-negative");
  }, 10_000);

  it("never leaks the private key to stderr or stdout", async () => {
    const SECRET_KEY =
      "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcdef";
    const r = await spawnRunning(
      {
        WALLET_PRIVATE_KEY: SECRET_KEY,
        WALLET_BUDGET_USD: "1.00",
      },
      1500,
    );
    expect(r.stdout).not.toContain(SECRET_KEY);
    expect(r.stderr).not.toContain(SECRET_KEY);
    // Even the unique 16-hex prefix shouldn't surface anywhere.
    expect(r.stderr).not.toContain("deadbeefcafebabe");
  }, 8000);

  it("never leaks the PAT to stderr or stdout", async () => {
    const SECRET_PAT = "gfpat_secretvaluethatshouldnotleak123456789";
    const r = await spawnRunning({ GATEFARE_PAT: SECRET_PAT }, 1500);
    expect(r.stdout).not.toContain(SECRET_PAT);
    expect(r.stderr).not.toContain(SECRET_PAT);
  }, 8000);

  it("exits cleanly on SIGTERM (steady state)", async () => {
    const r = await spawnRunning({}, 800);
    // Server was killed by SIGTERM; should exit promptly with either
    // signal=SIGTERM, exit code 0, or 143 (128+15).
    expect(
      r.signal === "SIGTERM" || r.exitCode === 0 || r.exitCode === 143,
    ).toBe(true);
  }, 8000);
});
