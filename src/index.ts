import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const { server, capabilities } = createServer();

  const tools = ["discovery", "safety"];
  if (capabilities.buyer) tools.push("buyer");
  if (capabilities.publisher) tools.push("publisher");

  console.error(
    `[gatefare-mcp] Starting with capabilities: ${tools.join(", ")}`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[gatefare-mcp] Fatal:", err);
  process.exit(1);
});
