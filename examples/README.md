# Examples

Runnable snippets and ready-to-use config files for `@gatefare/mcp`.

| File | What it shows |
|------|---------------|
| [`claude-desktop-config.json`](claude-desktop-config.json) | Drop-in config for Claude Desktop |
| [`cursor-config.json`](cursor-config.json) | Drop-in config for Cursor |
| [`python-agent.py`](python-agent.py) | Python script that spawns the MCP server and calls tools |
| [`typescript-agent.ts`](typescript-agent.ts) | Same idea in TypeScript with `@modelcontextprotocol/sdk` |
| [`discover-only.py`](discover-only.py) | Pure-discovery walkthrough — no wallet needed |
| [`pay-and-call.py`](pay-and-call.py) | End-to-end paid call with budget cap |

## Picking a path

- **Just trying it out?** Drop the Claude Desktop or Cursor config in, restart, and ask the agent to search the catalog. No wallet needed.
- **Building an agent in Python?** Start from `discover-only.py`, then `pay-and-call.py`.
- **Building in TypeScript / Node?** Start from `typescript-agent.ts`.
- **Want to publish your own API?** Add `GATEFARE_PAT` to the env in any config; the publisher tools become available.

## Wallets for testing

For mainnet you need real USDC on Base — get it from any L2 onramp.

For Sepolia testnet:
1. Set `WALLET_NETWORK=eip155:84532`.
2. Get test USDC at [faucet.circle.com](https://faucet.circle.com).
3. Get Base Sepolia ETH for gas at [thirdweb.com/base-sepolia](https://thirdweb.com/base-sepolia).

## Env vars used in examples

```bash
WALLET_PRIVATE_KEY=0x...           # 32 bytes, with or without 0x prefix
WALLET_BUDGET_USD=2.00             # optional runtime cap
WALLET_NETWORK=eip155:84532        # optional — Sepolia for testing
GATEFARE_PAT=gfpat_...             # only if you publish APIs
```
