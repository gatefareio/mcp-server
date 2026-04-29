/**
 * Real end-to-end test against live gatefare.io. Spawn the built MCP
 * server as a subprocess and exercise it through stdio JSON-RPC.
 *
 * Skipped when GATEFARE_E2E=1 isn't set — keeps CI independent of
 * remote uptime. Run locally with: npm run test:e2e
 */
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_BIN = resolve(__dirname, "../../dist/index.js");

const RUN_E2E = process.env["GATEFARE_E2E"] === "1";

async function makeClient(env: Record<string, string> = {}): Promise<Client> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_BIN],
    env: { GATEFARE_BASE_URL: "https://gatefare.io", ...env },
  });
  const client = new Client(
    { name: "e2e-test", version: "1.0.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

function getText(content: unknown): string {
  const arr = content as Array<{ type: string; text: string }>;
  return arr[0]?.text ?? "";
}

describe.skipIf(!RUN_E2E)("e2e: MCP server vs live gatefare.io", () => {
  describe("session lifecycle (no credentials)", () => {
    it("initializes, lists tools, exposes annotations", async () => {
      const client = await makeClient();
      try {
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);

        // Discovery + safety only (no creds)
        expect(names).toContain("gatefare.search_apis");
        expect(names).toContain("gatefare.get_api");
        expect(names).toContain("gatefare.list_categories");
        expect(names).toContain("gatefare.suggest");
        expect(names).toContain("gatefare.report_abuse");

        // No buyer / publisher
        expect(names).not.toContain("gatefare.call_api");
        expect(names).not.toContain("gatefare.register_api");

        // Annotations
        const search = tools.find((t) => t.name === "gatefare.search_apis");
        expect(search?.annotations?.readOnlyHint).toBe(true);
        expect(search?.annotations?.idempotentHint).toBe(true);
        expect(search?.annotations?.openWorldHint).toBe(true);

        // Each tool has an inputSchema
        for (const t of tools) {
          expect(t.inputSchema).toBeDefined();
          expect(t.inputSchema.type).toBe("object");
        }
      } finally {
        await client.close();
      }
    }, 30_000);

    it("calls list_categories successfully", async () => {
      const client = await makeClient();
      try {
        const r = await client.callTool({
          name: "gatefare.list_categories",
          arguments: {},
        });
        expect(r.isError).toBeFalsy();
        const parsed = JSON.parse(getText(r.content));
        expect(parsed).toHaveProperty("categories");
        expect(Array.isArray(parsed.categories)).toBe(true);
      } finally {
        await client.close();
      }
    }, 30_000);

    it("calls search_apis with a query", async () => {
      const client = await makeClient();
      try {
        const r = await client.callTool({
          name: "gatefare.search_apis",
          arguments: { query: "demo", page: 1 },
        });
        expect(r.isError).toBeFalsy();
        const parsed = JSON.parse(getText(r.content));
        expect(parsed).toHaveProperty("apis");
        expect(parsed).toHaveProperty("total");
      } finally {
        await client.close();
      }
    }, 30_000);

    it("zod errors come back with INVALID_INPUT, not crash", async () => {
      const client = await makeClient();
      try {
        const r = await client.callTool({
          name: "gatefare.get_api",
          arguments: {},
        });
        expect(r.isError).toBe(true);
        expect(getText(r.content)).toContain("INVALID_INPUT");
      } finally {
        await client.close();
      }
    }, 15_000);

    it("404 from upstream maps to API_NOT_FOUND", async () => {
      const client = await makeClient();
      try {
        const r = await client.callTool({
          name: "gatefare.get_api",
          arguments: { slug: "definitely-does-not-exist-xyzzz-zzzz" },
        });
        expect(r.isError).toBe(true);
        expect(getText(r.content)).toMatch(/API_NOT_FOUND|GATEFARE_API_ERROR/);
      } finally {
        await client.close();
      }
    }, 30_000);

    it("recovers from a tool error and continues serving", async () => {
      const client = await makeClient();
      try {
        // First: bad call
        const bad = await client.callTool({
          name: "gatefare.suggest",
          arguments: { query: "" },
        });
        expect(bad.isError).toBe(true);

        // Then: successful call still works
        const ok = await client.callTool({
          name: "gatefare.list_categories",
          arguments: {},
        });
        expect(ok.isError).toBeFalsy();
      } finally {
        await client.close();
      }
    }, 30_000);

    it("10 concurrent tool calls all succeed", async () => {
      const client = await makeClient();
      try {
        const results = await Promise.all(
          Array.from({ length: 10 }, () =>
            client.callTool({
              name: "gatefare.list_categories",
              arguments: {},
            }),
          ),
        );
        for (const r of results) {
          expect(r.isError).toBeFalsy();
        }
      } finally {
        await client.close();
      }
    }, 30_000);
  });

  describe("with WALLET_PRIVATE_KEY", () => {
    const WALLET_KEY = "0x" + "a".repeat(64);

    it("buyer tools become available", async () => {
      const client = await makeClient({ WALLET_PRIVATE_KEY: WALLET_KEY });
      try {
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        expect(names).toContain("gatefare.call_api");
        expect(names).toContain("gatefare.estimate_cost");
        expect(names).toContain("gatefare.get_wallet_balance");

        const callApi = tools.find((t) => t.name === "gatefare.call_api");
        expect(callApi?.annotations?.openWorldHint).toBe(true);
        expect(callApi?.annotations?.readOnlyHint).toBe(false);
      } finally {
        await client.close();
      }
    }, 30_000);

    it("estimate_cost on a missing slug returns API_NOT_FOUND", async () => {
      const client = await makeClient({ WALLET_PRIVATE_KEY: WALLET_KEY });
      try {
        const r = await client.callTool({
          name: "gatefare.estimate_cost",
          arguments: {
            slug: "this-slug-definitely-does-not-exist-zzzzz",
            n_calls: 1,
          },
        });
        expect(r.isError).toBe(true);
        expect(getText(r.content)).toMatch(/API_NOT_FOUND|GATEFARE_API_ERROR/);
      } finally {
        await client.close();
      }
    }, 30_000);
  });

  describe("with GATEFARE_PAT", () => {
    it("publisher tools become available (even if PAT is invalid)", async () => {
      const client = await makeClient({ GATEFARE_PAT: "gfpat_invalid_test" });
      try {
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        expect(names).toContain("gatefare.register_api");
        expect(names).toContain("gatefare.list_my_apis");
        expect(names).toContain("gatefare.distribute");

        const distribute = tools.find((t) => t.name === "gatefare.distribute");
        expect(distribute?.annotations?.destructiveHint).toBe(true);
      } finally {
        await client.close();
      }
    }, 30_000);
  });
});
