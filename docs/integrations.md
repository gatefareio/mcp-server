# Integration matrix

Pick a row by **what you're building**, the column shows **which tool to grab**.

| You want to… | Best tool | Notes |
|---|---|---|
| Add Gatefare to Claude Desktop / Cursor / Continue / Cline / Goose | **`@gatefare/mcp`** ← this repo | One JSON snippet in client config; `npx -y @gatefare/mcp` |
| Build an AI agent in Python that uses Gatefare | **`@gatefare/mcp` + `mcp` PyPI package** | Python spawns Node subprocess. See [`examples/python-agent.py`](../examples/python-agent.py) |
| Build an AI agent in TypeScript / Node | **`@gatefare/mcp` + `@modelcontextprotocol/sdk`** | Same idea. See [`examples/typescript-agent.ts`](../examples/typescript-agent.ts) |
| Pay for **any** x402 API from a Python backend (no AI agent) | **`x402-python`** ([PyPI](https://pypi.org/project/x402/)) | Coinbase's official SDK; paying for Gatefare APIs is the same as any other x402 API |
| Pay for **any** x402 API from a Go service | **`coinbase/x402/go`** | Same as above |
| Pay for **any** x402 API from a Java service | **`coinbase/x402/java`** | Same |
| Pay for **any** x402 API from TypeScript without MCP | **`@x402/fetch`** ([npm](https://www.npmjs.com/package/x402-fetch)) | Drop-in `fetch` replacement that handles 402s |
| Browse the Gatefare catalog from any language | **REST** — [`https://gatefare.io/api/catalog`](https://gatefare.io/api/catalog), [OpenAPI spec](https://gatefare.io/openapi.json) | No SDK needed — it's just JSON |
| Publish an API on Gatefare from a backend (no agent) | **REST** — `POST /api/publisher/apis` with PAT | Same as above; auth via `Authorization: Bearer gfpat_…` |

## Why we don't ship Python / Go / Java SDKs

The two pieces a Gatefare-specific SDK would bundle are:

1. **x402 payment flow** — already covered by Coinbase's official SDKs on PyPI / Go / Java. We'd just be re-wrapping their library.
2. **Gatefare REST endpoints** (catalog, publisher) — auto-discoverable from our [OpenAPI 3.1 spec](https://gatefare.io/openapi.json). Use any HTTP client + a code generator (`openapi-typescript-codegen`, `openapi-python-client`, `oapi-codegen` for Go) and you get a typed client in 30 seconds.

So a "Gatefare Python SDK" would be: 5 lines combining `x402-python` + an OpenAPI-generated client. We don't think there's enough leverage to maintain that for every language.

## When *would* it make sense?

We'll write a language-specific SDK if:

1. A user files an issue with a real use case that the above matrix doesn't cover.
2. The MCP path isn't viable (e.g. environment without Node).
3. Coinbase deprecates one of their official clients without a successor.

## Server-side / SaaS use case

Note that `@gatefare/mcp` is **client-side**: it spawns inside the developer's machine and signs payments locally. If you want to run a server that pays on behalf of many users (e.g. a SaaS that resells data through Gatefare), the right tool is one of:

- A regular HTTP server using `x402-python` or `@x402/fetch` to pay
- A custodial wallet you own + `x402-{lang}` to sign

Don't try to host `@gatefare/mcp` as a multi-tenant proxy — it's designed for single-user single-machine use.

## Summary

- **Anything agent-shaped** → `@gatefare/mcp`.
- **Anything backend-shaped** → official `x402-{python,go,java}` + plain REST to gatefare.io.
- **Anything browser-shaped** → call gatefare.io REST directly with a wallet (e.g. via [Coinbase OnchainKit](https://onchainkit.xyz)).

If your use case doesn't fit, [open an issue](https://github.com/gatefareio/mcp-server/issues) — we'll either add it to the matrix or build the SDK.
