import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parseConfig, detectCapabilities } from "./config.js";
import { GatefareClient } from "./client.js";
import { GatefareError } from "./types.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerBuyerTools } from "./tools/buyer.js";
import { registerPublisherTools } from "./tools/publisher.js";
import { registerSafetyTools } from "./tools/safety.js";

interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

interface ToolDef {
  description: string;
  schema: z.ZodType;
  annotations?: ToolAnnotations;
  handler: (input: unknown) => Promise<unknown>;
}

const SERVER_INSTRUCTIONS = `Gatefare gives AI agents access to a marketplace of paid HTTP APIs.
Payments are non-custodial USDC on Base via the open x402 standard.

Typical workflow:
- Discover: gatefare.search_apis or gatefare.list_categories.
- Inspect: gatefare.get_api for full details and pricing.
- Estimate: gatefare.estimate_cost before bulk calls (requires wallet).
- Call: gatefare.call_api handles payment automatically (requires wallet).

Tool availability depends on credentials:
- Discovery + safety tools: always available.
- Buyer tools (call_api, balance, estimate_cost): require WALLET_PRIVATE_KEY.
- Publisher tools (register_api, list_my_apis, etc.): require GATEFARE_PAT.

Errors carry stable codes (INVALID_INPUT, WALLET_NOT_CONFIGURED,
PAT_NOT_CONFIGURED, BUDGET_EXHAUSTED, INSUFFICIENT_BALANCE, PRICE_TOO_HIGH,
API_NOT_FOUND, UPSTREAM_ERROR, RATE_LIMITED, NETWORK_ERROR, GATEFARE_API_ERROR)
— clients can key off these for retry / surfacing logic.`;

export function createServer(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
) {
  const config = parseConfig(env);
  const capabilities = detectCapabilities(config);
  const client = new GatefareClient(config);

  const server = new McpServer(
    { name: "@gatefare/mcp", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  const allTools: Record<string, ToolDef> = {};

  Object.assign(allTools, registerDiscoveryTools(client));
  if (capabilities.buyer) Object.assign(allTools, registerBuyerTools(client, config));
  if (capabilities.publisher) Object.assign(allTools, registerPublisherTools(client, config));
  Object.assign(allTools, registerSafetyTools(client));

  for (const [name, tool] of Object.entries(allTools)) {
    const inputSchema =
      tool.schema instanceof z.ZodObject
        ? tool.schema.shape
        : tool.schema instanceof z.ZodEffects && tool.schema._def.schema instanceof z.ZodObject
          ? tool.schema._def.schema.shape
          : {};

    server.registerTool(
      name,
      {
        description: tool.description,
        inputSchema,
        annotations: tool.annotations,
      },
      async (params: Record<string, unknown>) => {
        try {
          // Re-validate against the full schema (with refinements like
          // superRefine) — registerTool only enforces the raw shape.
          const validated = tool.schema.parse(params);
          const result = await tool.handler(validated);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          return mapErrorToToolResult(err);
        }
      },
    );
  }

  return { server, config, capabilities, toolNames: Object.keys(allTools) };
}

function mapErrorToToolResult(err: unknown) {
  if (err instanceof GatefareError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { error: err.code, message: err.message, details: err.details },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  if (err instanceof z.ZodError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: "INVALID_INPUT",
              message: "Input validation failed",
              details: err.errors,
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error: "INTERNAL_ERROR",
            message: err instanceof Error ? err.message : String(err),
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}
