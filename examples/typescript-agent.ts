/**
 * TypeScript / Node example: spawn @gatefare/mcp as an MCP subprocess
 * and exercise discovery + a paid call.
 *
 * Run:
 *   npm install @modelcontextprotocol/sdk
 *   WALLET_PRIVATE_KEY=0x... npx tsx examples/typescript-agent.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function getText(r: ToolResult): string {
  return r.content[0]?.text ?? "";
}

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@gatefare/mcp"],
    env: {
      ...process.env,
      WALLET_PRIVATE_KEY: process.env["WALLET_PRIVATE_KEY"] ?? "",
      WALLET_BUDGET_USD: process.env["WALLET_BUDGET_USD"] ?? "1.00",
    },
  });

  const client = new Client(
    { name: "ts-agent-example", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);

  try {
    // Inspect available tools
    const { tools } = await client.listTools();
    console.log(
      "Available tools:",
      tools.map((t) => t.name).join(", "),
    );

    // 1. Discovery — search the catalog
    const search = (await client.callTool({
      name: "gatefare.search_apis",
      arguments: { query: "weather", max_price: 0.01, page: 1 },
    })) as ToolResult;
    const searchData = JSON.parse(getText(search));
    console.log(`\nFound ${searchData.total} APIs matching "weather"`);
    if (searchData.apis.length === 0) {
      console.log("Nothing to call. Try a different query.");
      return;
    }

    const api = searchData.apis[0];
    console.log(`First match: ${api.name} (${api.slug}) — ${api.price}`);

    // 2. Estimate the cost of 1 call
    if (process.env["WALLET_PRIVATE_KEY"]) {
      const est = (await client.callTool({
        name: "gatefare.estimate_cost",
        arguments: { slug: api.slug, n_calls: 1 },
      })) as ToolResult;
      const estData = JSON.parse(getText(est));
      console.log(`Cost for 1 call: ${estData.total}`);

      if (estData.enoughBalance === false) {
        console.log("Insufficient balance — skipping the paid call.");
        return;
      }

      // 3. Make a paid call — the server handles 402 → sign → retry
      const result = (await client.callTool({
        name: "gatefare.call_api",
        arguments: {
          slug: api.slug,
          query: { city: "Tokyo" },
          max_price: 0.01,
        },
      })) as ToolResult;

      if (result.isError) {
        const err = JSON.parse(getText(result));
        console.error(`Call failed: ${err.error} — ${err.message}`);
        return;
      }

      const data = JSON.parse(getText(result));
      console.log(
        `\nPaid ${data.payment.amount} for status ${data.status}.`,
      );
      console.log(`Body:`, data.body);
    } else {
      console.log("\n(Set WALLET_PRIVATE_KEY to also run a paid call.)");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
