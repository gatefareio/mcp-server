# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
