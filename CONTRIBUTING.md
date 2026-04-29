# Contributing to @gatefare/mcp

Thanks for your interest. This is a small, focused codebase — the bar for changes is "does it make the agent experience better?"

## Setup

```bash
git clone git@github.com:gatefareio/mcp-server.git
cd mcp-server
npm install
npm run test
```

## Workflow

1. Open an issue first for non-trivial changes (new tool, schema change, breaking behavior).
2. Branch from `main`.
3. Write tests. The bar is one happy path + one error path per tool, plus zod input coverage.
4. Run `npm run typecheck && npm run test && npm run build` locally.
5. Open a PR with a clear before/after.

## Style

- TypeScript strict mode. No `any` unless interop forces it.
- Error mapping goes through `GatefareError` with a stable `code`.
- Tools live under `src/tools/<domain>.ts` and export a single `register*Tools()` factory.
- No comments unless the *why* is non-obvious. Names should explain *what*.

## Adding a new tool

1. Define the zod schema next to the handler in the matching domain file.
2. Add the tool to that domain's `register*Tools()` return.
3. Add a unit test in `tests/tools/<domain>.test.ts`.
4. Update the tool table in `README.md`.
5. Note it in `CHANGELOG.md` under `## [Unreleased]`.

## Releasing

Maintainers only:

```bash
npm version <patch|minor|major>
git push --follow-tags
```

The `publish.yml` workflow handles npm.
