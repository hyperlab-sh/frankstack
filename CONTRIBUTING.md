# Contributing to Frankstack

Frankstack is at the stage of testing its idea. The most useful contributions right now are
corrections to how a stack is described on the site, and reports of pieces that do not compose the
way their description says.

## Reporting bugs

Open a [bug report](https://github.com/hyperlab-sh/frankstack/issues/new?template=bug_report.yml).
For a wrong description of a stack, link the file and line in that stack's repository that shows
what it really does.

## Suggesting features

Open a [feature request](https://github.com/hyperlab-sh/frankstack/issues/new?template=feature_request.yml).
Describe the problem before the solution.

## Development setup

```sh
git clone git@github.com:hyperlab-sh/frankstack.git
cd frankstack
bun install
bun run lint
```

## Code style

- TypeScript, strict mode. Biome enforces lint and format; run `bun run lint:fix` before committing.
- Full words in identifiers. `service`, not `svc`.
- No default values for environment variables that must be set. Throw if missing.
- Another project's files are in one place only: `catalog/<stack>/`, as marked copies with the
  stack's `LICENSE` beside them, and only when that licence allows copying and changing them
  (`docs/catalog.md`). A bundle built by hand for a test is not committed.

## Pull requests

- Branch from `main` as `feat/<short-desc>`, `fix/<short-desc>` or `chore/<short-desc>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `type(scope): summary`.
- Add or update tests for behaviour you change. Run only the tests your change affects.
- Keep PRs focused. Split unrelated changes.

## Questions

Use [GitHub Discussions](https://github.com/hyperlab-sh/frankstack/discussions).
