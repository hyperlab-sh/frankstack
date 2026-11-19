# Frankstack

A tool for composing a personal agent stack from pieces of published stacks. The output is a bundle
that the user's own agent assembles. Frankstack is not a runtime and does not judge stack quality.

## Layout

- `apps/site`: the website (Marko Run, static build). Comparison pages live under `/learn`.
- `packages/`: tooling (the checker).

## Commands

```sh
bun install
bun run lint       # biome check
bun run lint:fix
bun run build      # every workspace
bun run typecheck
bun run test       # CI only; locally run the affected tests (see below)
```

## Conventions

- Package manager: bun. Never npm.
- Biome for JS, TS and JSON; tabs.
- Run only the tests your change affects. In `apps/site`: `bun run build`, then
  `bunx vitest related <changed files> --run` (the site tests read `dist/public`).
- Never commit another project's files. A block is referenced by repository, commit and path.
- Environment variables that are required have no defaults; missing ones throw.
- Commits: `type(scope): summary` (Conventional Commits).
