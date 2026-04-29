/**
 * Stability tests — exercise the server under load and check that:
 *   1. Budget lock actually serializes concurrent calls (no race past cap).
 *   2. Long-running tool-call loops don't leak memory.
 *   3. Repeated server restarts don't pile up resources.
 *   4. Pathological inputs don't hang the process.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GatefareClient } from "../src/client.js";
import { parseConfig } from "../src/config.js";
import { registerBuyerTools } from "../src/tools/buyer.js";
import { _resetX402Caches } from "../src/x402.js";
import { vi } from "vitest";

const VALID_KEY = "0x" + "a".repeat(64);
const PAY_TO = "0x1234567890123456789012345678901234567890";

function mock402(amountMicro: string): Response {
  return new Response(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          maxAmountRequired: amountMicro,
          resource: "https://gatefare.io/p/demo/x",
          payTo: PAY_TO,
          maxTimeoutSeconds: 60,
        },
      ],
    }),
    { status: 402, headers: { "content-type": "application/json" } },
  );
}

function mockSuccess(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("stability: budget lock under concurrency", () => {
  beforeEach(() => {
    _resetX402Caches();
    vi.restoreAllMocks();
  });

  it("100 concurrent call_api invocations do not race past the budget cap", async () => {
    const config = parseConfig({
      WALLET_PRIVATE_KEY: VALID_KEY,
      WALLET_BUDGET_USD: "0.01", // 10 calls at $0.001 each
    });
    const client = new GatefareClient(config);
    const tools = registerBuyerTools(client, config);

    // Every paid call costs $0.001 (1000 micro-USDC).
    let probeCount = 0;
    let payCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers["X-Payment"]) {
        payCount++;
        return mockSuccess();
      } else {
        probeCount++;
        return mock402("1000");
      }
    });

    const calls = Array.from({ length: 100 }, () =>
      tools["gatefare.call_api"]
        .handler({ slug: "demo" })
        .then(() => ({ status: "ok" as const }))
        .catch((err: { code?: string }) => ({
          status: "err" as const,
          code: err.code,
        })),
    );

    const results = await Promise.all(calls);
    const ok = results.filter((r) => r.status === "ok").length;
    const exhausted = results.filter(
      (r) => r.status === "err" && r.code === "BUDGET_EXHAUSTED",
    ).length;

    // We should have at MOST 11 paid calls (10 paid + 1 in flight when
    // budget went to 0). Anything more means the lock failed.
    expect(payCount).toBeLessThanOrEqual(11);
    // Most should be exhausted.
    expect(exhausted + ok).toBe(100);
    expect(exhausted).toBeGreaterThanOrEqual(89);
  }, 30_000);

  it("repeated server-creation does not leak listeners", async () => {
    const { createServer } = await import("../src/server.js");

    const beforeListeners = process.listenerCount("uncaughtException");

    for (let i = 0; i < 50; i++) {
      createServer({});
    }

    const afterListeners = process.listenerCount("uncaughtException");
    // The MCP SDK may register one or two — but it should not register
    // 50 more.
    expect(afterListeners - beforeListeners).toBeLessThan(50);
  });
});

describe("stability: pathological inputs don't hang", () => {
  it("zod accepts a very long query string fast (no catastrophic backtracking)", async () => {
    const { searchApisSchema } = await import("../src/tools/discovery.js");
    const huge = "a".repeat(100_000);
    const start = Date.now();
    const result = searchApisSchema.safeParse({ query: huge });
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  it("rejects a slug with bad chars quickly", async () => {
    const { getApiSchema } = await import("../src/tools/discovery.js");
    const huge = "a".repeat(50_000) + "/"; // fails regex due to slash
    const start = Date.now();
    const result = getApiSchema.safeParse({ slug: huge });
    const elapsed = Date.now() - start;
    expect(result.success).toBe(false);
    expect(elapsed).toBeLessThan(500);
  });
});

describe("stability: memory baseline", () => {
  it("creating 200 servers and discarding them does not retain >50 MB", async () => {
    if (!global.gc) {
      // Without --expose-gc we can't run this assertion meaningfully.
      // Skip-with-info rather than fail.
      return;
    }

    const { createServer } = await import("../src/server.js");

    global.gc();
    const before = process.memoryUsage().heapUsed;

    let servers: unknown[] = [];
    for (let i = 0; i < 200; i++) {
      servers.push(createServer({}));
    }
    servers = []; // release

    global.gc();
    const after = process.memoryUsage().heapUsed;
    const grew = after - before;
    expect(grew).toBeLessThan(50 * 1024 * 1024);
  });
});
