"""
Python agent example: spawn @gatefare/mcp as an MCP subprocess and
exercise discovery + paid call. The same MCP server works for any
language — Node only because the binary is JS.

Run:
    pip install mcp
    WALLET_PRIVATE_KEY=0x... python examples/python-agent.py

Without WALLET_PRIVATE_KEY, only the discovery walkthrough runs.
"""

import asyncio
import json
import os

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main() -> None:
    env = {}
    if os.environ.get("WALLET_PRIVATE_KEY"):
        env["WALLET_PRIVATE_KEY"] = os.environ["WALLET_PRIVATE_KEY"]
        env["WALLET_BUDGET_USD"] = os.environ.get("WALLET_BUDGET_USD", "1.00")
        env["WALLET_NETWORK"] = os.environ.get("WALLET_NETWORK", "eip155:8453")

    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@gatefare/mcp"],
        env=env,
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            tool_names = [t.name for t in tools.tools]
            print(f"Tools available: {', '.join(tool_names)}")

            # Discovery — always works
            search = await session.call_tool(
                "gatefare.search_apis",
                arguments={"query": "weather", "max_price": 0.01},
            )
            data = json.loads(search.content[0].text)
            print(f"\nFound {data['total']} weather APIs under $0.01")

            if not data["apis"]:
                print("No APIs matched; try another query.")
                return

            api = data["apis"][0]
            print(f"First: {api['name']} ({api['slug']}) — {api['price']}")

            # Paid call — only if wallet configured
            if "gatefare.call_api" not in tool_names:
                print("\n(Set WALLET_PRIVATE_KEY to enable a paid call.)")
                return

            result = await session.call_tool(
                "gatefare.call_api",
                arguments={
                    "slug": api["slug"],
                    "query": {"city": "London"},
                    "max_price": 0.01,
                },
            )

            if result.isError:
                err = json.loads(result.content[0].text)
                print(f"\nCall failed: {err['error']} — {err['message']}")
                return

            payload = json.loads(result.content[0].text)
            print(f"\nPaid {payload['payment']['amount']} for status {payload['status']}")
            print(f"Body: {payload['body']}")


if __name__ == "__main__":
    asyncio.run(main())
