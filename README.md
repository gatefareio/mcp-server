# @gatefare/mcp

[![npm version](https://img.shields.io/npm/v/@gatefare/mcp.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/@gatefare/mcp)
[![npm downloads](https://img.shields.io/npm/dm/@gatefare/mcp?color=cb3837)](https://www.npmjs.com/package/@gatefare/mcp)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@gatefare/mcp?color=success)](https://bundlephobia.com/package/@gatefare/mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/gatefareio/mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/gatefareio/mcp-server/actions/workflows/ci.yml)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-listed-7C3AED?logo=anthropic)](https://registry.modelcontextprotocol.io/v0.1/servers?search=gatefareio)
[![Base](https://img.shields.io/badge/Base-mainnet-0052FF)](https://base.org)

> Give your AI agent a wallet and a marketplace.
>
> `@gatefare/mcp` is a Model Context Protocol server that connects Claude
> Desktop, Cursor, or any MCP-compatible agent to the
> [Gatefare](https://gatefare.io) catalog of paid HTTP APIs. Payments
> settle as USDC on Base via the open [x402](https://x402.org) standard
> — no SaaS keys, no subscriptions, no escrow. Non-custodial: signing
> happens locally; the private key never leaves your machine.

![Demo: install, list tools, real call against gatefare.io](docs/demo.gif)

```
┌─────────────┐                ┌──────────────┐                ┌─────────────────┐
│ Claude /    │   MCP stdio    │ @gatefare/mcp│  HTTP + x402   │ gatefare.io     │
│ Cursor /    │ ─────────────► │   (this repo)│ ─────────────► │ proxy +         │
│ your agent  │                │              │                │ catalog         │
└─────────────┘                └──────┬───────┘                └─────────────────┘
                                      │
                                      │ EIP-3009 sign
                                      ▼
                                ┌─────────────┐
                                │  Base USDC  │
                                └─────────────┘
```

## Quick start

### 1. Drop into your client

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gatefare": {
      "command": "npx",
      "args": ["-y", "@gatefare/mcp"]
    }
  }
}
```

**Cursor** — `~/.cursor/mcp.json` or project-level `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gatefare": {
      "command": "npx",
      "args": ["-y", "@gatefare/mcp"]
    }
  }
}
```

Restart the client. The agent now has 5 read-only tools — discovery + safety. Try:

> *"Search Gatefare for weather APIs."*

### 2. Add a wallet to make paid calls

Add `env` to the same config:

```json
{
  "mcpServers": {
    "gatefare": {
      "command": "npx",
      "args": ["-y", "@gatefare/mcp"],
      "env": {
        "WALLET_PRIVATE_KEY": "0xYOUR_KEY",
        "WALLET_BUDGET_USD": "5.00"
      }
    }
  }
}
```

Buyer tools (`call_api`, `get_wallet_balance`, `estimate_cost`) become available. The
`WALLET_BUDGET_USD` cap is a runtime safety net — for a hard cap, fund the wallet with
only what you're willing to spend.

> *"What's London's weather right now? Spend up to $0.001."*

### 3. (Optional) Publish your own APIs

Get a PAT at [gatefare.io/dashboard/tokens](https://gatefare.io/dashboard/tokens) and add:

```json
"env": {
  "GATEFARE_PAT": "gfpat_..."
}
```

Publisher tools (`register_api`, `list_my_apis`, `update_api`, `get_revenue`,
`distribute`) appear.

> *"Publish my API at https://api.example.com/sentiment for $0.001 per call."*

## Tools

13 tools across 4 domains. Tools auto-register based on which env vars are set —
the agent never sees a tool it can't use.

### Discovery — always available

| Tool | Description |
|------|-------------|
| `gatefare.search_apis` | Full-text search the catalog with filters (price, category, sort) |
| `gatefare.get_api` | Full details for one API by slug or `handle/urlName` |
| `gatefare.list_categories` | All categories with API counts |
| `gatefare.suggest` | Autocomplete suggestions for a query string |

### Buyer — needs `WALLET_PRIVATE_KEY`

| Tool | Description |
|------|-------------|
| `gatefare.call_api` | Make a paid call. Handles 402 → sign → retry automatically |
| `gatefare.get_wallet_balance` | USDC + ETH on Base, plus remaining runtime budget |
| `gatefare.estimate_cost` | Project total cost for N planned calls |

### Publisher — needs `GATEFARE_PAT`

| Tool | Description |
|------|-------------|
| `gatefare.register_api` | Publish a new paid API |
| `gatefare.list_my_apis` | Your published APIs with stats |
| `gatefare.update_api` | Edit metadata, price, target URL |
| `gatefare.get_revenue` | Revenue time series + totals |
| `gatefare.distribute` | Trigger on-chain `distribute()` payout (destructive) |

### Safety — always available

| Tool | Description |
|------|-------------|
| `gatefare.report_abuse` | Report a malicious / stolen API (DMCA, fraud, malware…) |

## Configuration

| Var | Default | Required for |
|-----|---------|--------------|
| `GATEFARE_BASE_URL` | `https://gatefare.io` | — (override for self-hosted) |
| `WALLET_PRIVATE_KEY` | — | Any buyer tool |
| `WALLET_BUDGET_USD` | unlimited | Optional spend cap |
| `WALLET_NETWORK` | `eip155:8453` | `eip155:84532` for Sepolia testnet |
| `GATEFARE_PAT` | — | Any publisher tool |
| `LOG_LEVEL` | `info` | `debug` for verbose stderr |

## Examples

### Discover & buy in one breath (Claude Desktop)

> **You:** *Find me a sub-$0.001 weather API and call it for "Tokyo".*
>
> **Claude:** *Calling `gatefare.search_apis` with `max_price: 0.001`…*  
>           *Found `demo-weather` by @alice at $0.001/call.*  
>           *Calling `gatefare.call_api` with `slug: "demo-weather"`, `query: {city: "Tokyo"}`…*  
>           *Tokyo is 22°C, partly cloudy. Paid 0.001 USDC. Receipt: `settled-tx-0x9a…`*

### Programmatic — Python agent

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

server = StdioServerParameters(
    command="npx",
    args=["-y", "@gatefare/mcp"],
    env={"WALLET_PRIVATE_KEY": "0x...", "WALLET_BUDGET_USD": "1.00"},
)

async with stdio_client(server) as (r, w):
    async with ClientSession(r, w) as s:
        await s.initialize()
        result = await s.call_tool(
            "gatefare.call_api",
            arguments={"slug": "demo-weather", "query": {"city": "Tokyo"}},
        )
        print(result.content[0].text)
```

See [`examples/`](examples/) for runnable variants: Claude Desktop, Cursor, Python,
TypeScript, and a pure-discovery walkthrough.

### Not building an AI agent? Picking the right tool

If you want to **pay for x402 APIs from a backend** (no agent), use Coinbase's
official x402 SDKs — `x402-python` (PyPI), `coinbase/x402/go`, `…/java`, or
[`@x402/fetch`](https://www.npmjs.com/package/x402-fetch). They handle the
payment flow; you don't need this MCP server.

If you want to **browse the Gatefare catalog** from any language, hit the
REST API directly: [`gatefare.io/api/catalog`](https://gatefare.io/api/catalog)
([OpenAPI 3.1 spec](https://gatefare.io/openapi.json)).

Full breakdown of which tool fits which use case in
[`docs/integrations.md`](docs/integrations.md).

### Direct CLI (for debugging)

```bash
# Run the server in foreground; talks JSON-RPC over stdio.
npx -y @gatefare/mcp

# In another terminal, send a frame:
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  npx -y @gatefare/mcp
```

## Errors

Tool results include `isError: true` and a structured body
`{ error: <code>, message: <human>, details?: <any> }`. Codes are stable —
agents can switch on them for retry / surfacing logic.

| Code | Meaning |
|------|---------|
| `INVALID_INPUT` | Input failed zod validation |
| `WALLET_NOT_CONFIGURED` | Set `WALLET_PRIVATE_KEY` for buyer tools |
| `PAT_NOT_CONFIGURED` | Set `GATEFARE_PAT` for publisher tools |
| `BUDGET_EXHAUSTED` | Runtime budget cap hit |
| `INSUFFICIENT_BALANCE` | Wallet doesn't have enough USDC |
| `PRICE_TOO_HIGH` | Server's price exceeds your `max_price` |
| `API_NOT_FOUND` | Slug doesn't exist or is suspended |
| `UPSTREAM_ERROR` | Paid API returned non-2xx, or its 402 was malformed |
| `RATE_LIMITED` | Gatefare rate-limited the request |
| `NETWORK_ERROR` | Could not reach Gatefare |
| `GATEFARE_API_ERROR` | Gatefare returned a 4xx / 5xx |

## How it works (the 30-second version)

1. The agent calls `gatefare.call_api { slug: "demo-weather", … }`.
2. We `GET https://gatefare.io/p/demo-weather` (no payment yet).
3. The Gatefare proxy returns **402 Payment Required** with `accepts: [{network, payTo, maxAmountRequired, …}]`.
4. We sign an [EIP-3009 `transferWithAuthorization`](https://eips.ethereum.org/EIPS/eip-3009) for that exact amount and recipient on the configured network.
5. We retry the request with the signed `X-Payment` header (base64-encoded JSON, x402 v2).
6. Gatefare verifies the signature, settles the USDC transfer, and proxies the call to the upstream API.
7. We hand the upstream response (and a payment receipt) back to the agent.

The signature is single-use, time-bounded, and never leaves your machine for any
purpose other than this exact transfer to this exact `payTo`. The private key
is never logged.

## Security

- **Non-custodial.** Private keys live in your env, signing happens locally,
  no Gatefare service ever sees them.
- **Network confusion-resistant.** A malicious gateway returning Sepolia-only
  requirements to a mainnet user is rejected — we never sign for a chain
  the user didn't configure.
- **Cryptographically random nonces.** No `Date.now()`-based collisions.
- **Validity window clamped to 1 hour** even if the server requests more.
- **Strict input validation.** Slugs are `^[a-z0-9_-]+$` and URL-encoded;
  no path traversal. `targetUrl` blocks `file://`, `localhost`, cloud
  metadata IPs, `.local`, and `.internal` hosts at registration time.
- **Secret hygiene.** Tests assert that the private key and PAT never
  appear in stderr / stdout, ever.

## Development

```bash
git clone https://github.com/gatefareio/mcp-server.git
cd mcp-server
npm install
npm run typecheck
npm test                  # 138 unit tests
npm run test:e2e          # 10 e2e tests against live gatefare.io (set GATEFARE_E2E=1)
npm run build
```

To use a local checkout in your client config:

```bash
npm link
# in claude_desktop_config.json:
#   "command": "gatefare-mcp"
```

### Architecture

```
src/
├── index.ts        # entry — wires stdio transport
├── server.ts       # McpServer instance + tool registration
├── config.ts       # env parsing, capability detection
├── client.ts       # REST client (wraps fetch)
├── x402.ts         # 402 parsing + EIP-3009 signing
├── types.ts        # shared types + GatefareError
└── tools/
    ├── discovery.ts   # search_apis, get_api, list_categories, suggest
    ├── buyer.ts       # call_api, get_wallet_balance, estimate_cost
    ├── publisher.ts   # register_api, list_my_apis, update_api, get_revenue, distribute
    └── safety.ts      # report_abuse
```

### Test layout

```
tests/
├── config.test.ts         # env parsing edges
├── client.test.ts         # HTTP client error mapping
├── x402.test.ts           # signing + parsing primitives
├── x402-flow.test.ts      # full 402 → sign → retry handshake (mocked fetch)
├── server.test.ts         # capability-driven tool registration
├── init.test.ts           # subprocess: bootstrap, env crashes, secret leakage
├── stdio-protocol.test.ts # stdout pollution + recovery from tool errors
├── stability.test.ts      # 100 concurrent calls, memory baseline, ReDoS
├── tools/
│   ├── discovery.test.ts
│   ├── buyer.test.ts
│   ├── buyer-flow.test.ts
│   ├── publisher.test.ts
│   └── safety.test.ts
└── integration/
    └── e2e.test.ts        # real gatefare.io, gated by GATEFARE_E2E=1
```

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow,
style guide, and how to add a new tool.

## License

[MIT](LICENSE) © Gatefare

## Links

- 🌐 Marketplace: [gatefare.io](https://gatefare.io)
- 📚 API docs: [gatefare.io/docs](https://gatefare.io/docs)
- 🤖 LLM context (single file): [gatefare.io/llms-full.txt](https://gatefare.io/llms-full.txt)
- 📐 OpenAPI spec: [gatefare.io/openapi.json](https://gatefare.io/openapi.json)
- 🐦 Twitter: [@Gatefareio](https://twitter.com/Gatefareio)
- 🔌 Model Context Protocol: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- 💸 x402 standard: [x402.org](https://x402.org)
