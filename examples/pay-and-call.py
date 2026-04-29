"""
End-to-end paid call: discover → estimate → pay → consume.

Requires a wallet with USDC. For testing on Sepolia, set
WALLET_NETWORK=eip155:84532 and fund from faucet.circle.com.

Run:
    pip install mcp
    WALLET_PRIVATE_KEY=0x... python examples/pay-and-call.py
"""

import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


SLUG = "demo-weather"  # replace with a real catalog slug


async def main() -> None:
    key = os.environ.get("WALLET_PRIVATE_KEY")
    if not key:
        sys.exit("Set WALLET_PRIVATE_KEY in your env first.")

    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@gatefare/mcp"],
        env={
            "WALLET_PRIVATE_KEY": key,
            "WALLET_BUDGET_USD": os.environ.get("WALLET_BUDGET_USD", "1.00"),
            "WALLET_NETWORK": os.environ.get("WALLET_NETWORK", "eip155:8453"),
        },
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # 1. Sanity check — verify the buyer tools showed up.
            tools = {t.name for t in (await session.list_tools()).tools}
            assert "gatefare.call_api" in tools, "buyer tools missing — wallet env not picked up"

            # 2. Confirm we have funds for the planned spend.
            est = await session.call_tool(
                "gatefare.estimate_cost",
                arguments={"slug": SLUG, "n_calls": 1},
            )
            est_data = json.loads(est.content[0].text)
            print(f"Estimated cost for 1 call: {est_data['total']} {est_data['currency']}")
            if est_data.get("enoughBalance") is False:
                sys.exit(
                    f"Wallet balance {est_data.get('walletBalance')} USDC is not enough."
                )

            # 3. Make the paid call. The server handles 402 → sign → retry.
            result = await session.call_tool(
                "gatefare.call_api",
                arguments={
                    "slug": SLUG,
                    "query": {"city": "Tokyo"},
                    "max_price": 0.01,  # abort if posted price > $0.01
                },
            )

            if result.isError:
                err = json.loads(result.content[0].text)
                sys.exit(f"Call failed: {err['error']} — {err['message']}")

            payload = json.loads(result.content[0].text)
            print(f"Status: {payload['status']}")
            print(f"Paid: {payload['payment']['paid']}, amount: {payload['payment']['amount']}")
            if payload["payment"].get("receiptHeader"):
                print(f"Receipt: {payload['payment']['receiptHeader']}")
            print(f"Body: {payload['body']}")


if __name__ == "__main__":
    asyncio.run(main())
