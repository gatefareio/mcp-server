# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-05-26

### Changed

- README now shows live discovery badges (mcp.so listing + Glama score)
  so visitors immediately see the package is indexed across the major
  MCP directories.
- No functional changes; tools, schemas, and runtime behavior are
  byte-identical to v1.1.0.

## [1.1.0] - 2026-05-20

### Added

- `gatefare.publisher_reputation` tool — returns positive-only trust
  badges (Established / Top contributor / Highly rated) computed by
  the Gatefare backend on every catalog listing. Agents can call this
  BEFORE issuing a paid call to gauge counterparty risk without
  spending USDC. Always available (no credentials required).
- `gatefare.sample_response` tool — returns the publisher-pasted
  representative response. Lets the agent see the expected output
  shape BEFORE paying. Useful in tandem with the captured-example
  in `gatefare.get_api` to spot inconsistencies. Always available.
- New module `src/tools/trust.ts` aggregates the above. Wired into
  the server alongside discovery, buyer, publisher, safety modules.

### Compatibility

- Non-breaking. Existing v1.0.x tools and their inputs/outputs are
  unchanged. The two additions sit at `gatefare.publisher_reputation`
  and `gatefare.sample_response` — different names than anything
  shipped previously.
- Backend support shipped on gatefare.io with BACKLOG #46 (reputation)
  and #47 (sample_response). Older listings still return null for
  these fields, and both new tools handle that gracefully (legacy
  rows return `reputation: null` and `provided: false`).

## [1.0.1] - 2026-04-29

### Added

- `mcpName` (`io.github.gatefareio/mcp-server`) in `package.json` for the
  official MCP Registry namespace.
- `server.json` with full input-environment metadata so registry-driven
  installers can prompt the user for the right env vars.
- Expanded npm keywords / GitHub topics to be vendor-neutral
  (Cursor / Continue / Cline are first-class clients alongside Claude
  Desktop).

### Changed

- Package description rewritten to lead with "works with any MCP client",
  not just Claude.

## [1.0.0] - 2026-04-29

### Added

- Initial public release.
- 13 tools across discovery, buyer, publisher, and safety domains.
- Capability detection: tools auto-register based on env credentials.
- x402 payment flow with EIP-3009 USDC signing on Base mainnet and Sepolia.
- Runtime budget cap via `WALLET_BUDGET_USD`.
- 138 unit + 10 e2e tests; 88.54% coverage.
- GitHub Actions for CI and npm publish on tag.
- Examples for Claude Desktop, Cursor, Python, and TypeScript agents.
