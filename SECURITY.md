# Security policy

## Reporting a vulnerability

Email [security@gatefare.io](mailto:security@gatefare.io). Please include:

- The version of `@gatefare/mcp` (or git commit) you found it in
- A short description, repro steps, and the impact
- (Optional) a suggested fix

We respond within 72 hours and aim to release a patched version within 7
days for high-severity issues. We'll credit you in the CHANGELOG unless
you ask us not to.

## Don't open public issues for security bugs

GitHub Issues is public. If a vulnerability is exploitable, posting it
publicly hands a free attack to anyone watching the repo before we ship
a fix. Email instead.

## What's in scope

- The MCP server itself (`@gatefare/mcp` published to npm)
- The signing flow (EIP-3009 / x402)
- The HTTP client to `gatefare.io`
- Any leakage of `WALLET_PRIVATE_KEY`, `GATEFARE_PAT`, or other secrets
  via stdout, stderr, error messages, or tool results

## What's out of scope

- Vulnerabilities in `gatefare.io` itself — report at
  [security@gatefare.io](mailto:security@gatefare.io) but they go to a
  different triage queue
- Issues in upstream dependencies (`viem`, `zod`,
  `@modelcontextprotocol/sdk`) — please report directly to those projects
- "MCP server lets a malicious user spend their own wallet" — that's
  the design. Use `WALLET_BUDGET_USD` for runtime caps and fund the
  wallet with only what you want spent.

## Disclosure

Once a fix is released:

1. We publish a `v1.x.y` patch on npm.
2. We open a GitHub Security Advisory describing the issue and which
   versions are affected.
3. The CHANGELOG gets a `### Security` line for that version.

We won't request CVEs unless the issue is severe and exploitable in
default configurations.
