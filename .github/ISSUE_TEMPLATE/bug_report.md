---
name: Bug report
about: Something broke or behaves wrong
title: ""
labels: bug
assignees: ""
---

**What happened**

Brief description of the unexpected behavior.

**What you expected**

What should have happened instead.

**Steps to reproduce**

1. Set env: `…`
2. Spawn the server with: `…`
3. Send tool call: `gatefare.<tool> { … }`
4. Observe: …

If the bug involves a paid call, please include the network and a redacted
slug — never paste your private key or PAT.

**Environment**

- OS: macOS / Linux / Windows + version
- Node: `node --version`
- `@gatefare/mcp` version: `npm view @gatefare/mcp version` or what you have installed
- MCP client: Claude Desktop / Cursor / custom + version
- `WALLET_NETWORK`: mainnet / sepolia / not set

**Logs (stderr only — stdout is the protocol channel)**

Paste relevant `[gatefare-mcp]` lines from your client's MCP log
(Claude Desktop: `~/Library/Logs/Claude/mcp*.log`).
