# VHS tape — demo gif of @gatefare/mcp
# Build: vhs docs/demo.tape  → produces docs/demo.gif

Output docs/demo.gif

Set FontSize 18
Set Width 1200
Set Height 720
Set TypingSpeed 30ms
Set PlaybackSpeed 1.0

# Setup — install + create JSON request fixtures
Hide
Type `npm install -g @gatefare/mcp@latest >/dev/null 2>&1`
Enter
Sleep 5s
Type `printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' > /tmp/list.json`
Enter
Sleep 200ms
Type `printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"gatefare.list_categories","arguments":{}}}' > /tmp/cats.json`
Enter
Sleep 200ms
Type `clear`
Enter
Sleep 200ms
Show

# Slide 1 — what is it
Type `# @gatefare/mcp — Pay for HTTP APIs from your AI agent.`
Sleep 1500ms
Enter
Type `# 1) Drop into Claude Desktop / Cursor:`
Enter
Sleep 800ms
Type `cat <<'EOF'`
Enter
Type `{`
Enter
Type `  "mcpServers": {`
Enter
Type `    "gatefare": {`
Enter
Type `      "command": "npx",`
Enter
Type `      "args": ["-y", "@gatefare/mcp"]`
Enter
Type `    }`
Enter
Type `  }`
Enter
Type `}`
Enter
Type `EOF`
Enter
Sleep 3000ms

Type `clear`
Enter
Sleep 200ms

# Slide 2 — list tools
Type `# 2) The agent sees these tools (live JSON-RPC):`
Sleep 800ms
Enter
Type `cat /tmp/list.json | gatefare-mcp 2>/dev/null | jq -r '.result.tools[] | "  - " + .name'`
Enter
Sleep 4500ms

Type `clear`
Enter
Sleep 200ms

# Slide 3 — real call
Type `# 3) Real call against gatefare.io — top categories:`
Sleep 800ms
Enter
Type `cat /tmp/cats.json | gatefare-mcp 2>/dev/null | jq -r '.result.content[0].text | fromjson | .categories[:6][] | "  " + .name'`
Enter
Sleep 5000ms

Type `clear`
Enter
Sleep 200ms

# Slide 4 — outro
Type `# Add WALLET_PRIVATE_KEY -> 3 buyer tools (call_api, balance, estimate)`
Sleep 1000ms
Enter
Type `# Add GATEFARE_PAT       -> 5 publisher tools (register, distribute, ...)`
Sleep 1000ms
Enter
Type `# Non-custodial. USDC on Base. Open x402 standard.`
Sleep 1000ms
Enter
Type `# https://github.com/gatefareio/mcp-server`
Enter
Type `# https://www.npmjs.com/package/@gatefare/mcp`
Enter
Sleep 3500ms
