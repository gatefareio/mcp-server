<!-- Thanks for the contribution. Keep PRs small and focused — one
behavior change per PR. -->

## Summary

What does this PR change in one sentence?

## Why

The motivation: bug, feature request, follow-up to a previous PR. Link
the issue if there is one (`Fixes #123`).

## Approach

Brief sketch of the implementation choice, especially if there were
trade-offs you considered.

## Tests

- [ ] Added / updated unit tests in `tests/`
- [ ] Ran `npm run typecheck && npm test` locally — green
- [ ] Ran `npm run test:e2e` if behavior touches the live gatefare.io flow
- [ ] `npm run build` clean

## Checklist

- [ ] No `console.log` in `src/` (would corrupt MCP stdio)
- [ ] No new dependency without a one-line justification in the PR body
- [ ] Errors map to a stable code in `src/types.ts → ErrorCode` (don't
      add ad-hoc codes)
- [ ] If you added a tool: annotations are set
      (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`)
- [ ] If you bumped behavior: CHANGELOG entry under `[Unreleased]`
- [ ] No secrets in the diff (gitleaks will catch it but spot-check)
