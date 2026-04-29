"""
Discovery-only walkthrough. No wallet, no PAT — the server only exposes
the 5 read-only tools (search/get/list/suggest/report_abuse).

Run:
    pip install mcp
    python examples/discover-only.py
"""

import asyncio
import json

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main() -> None:
    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@gatefare/mcp"],
        env={},  # no creds → discovery + safety only
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # 1. List tools the agent will see.
            tools = await session.list_tools()
            print("Available tools:")
            for t in tools.tools:
                kind = "ro" if t.annotations and t.annotations.readOnlyHint else "rw"
                print(f"  • {t.name} [{kind}] — {t.description[:60]}")

            # 2. List categories.
            cats = await session.call_tool("gatefare.list_categories", arguments={})
            data = json.loads(cats.content[0].text)
            print(f"\nCategories: {len(data['categories'])}")
            for c in data["categories"][:5]:
                print(f"  • {c['name']} ({c['apiCount']} APIs)")

            # 3. Search the catalog.
            search = await session.call_tool(
                "gatefare.search_apis",
                arguments={"query": "weather", "max_price": 0.01},
            )
            data = json.loads(search.content[0].text)
            print(f"\nWeather APIs under $0.01: {data['total']}")
            for api in data["apis"][:3]:
                print(f"  • {api['name']} ({api['slug']}) — {api['price']}")


if __name__ == "__main__":
    asyncio.run(main())
