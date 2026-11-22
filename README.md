# Frankstack

> Build your own agent stack from pieces of other people's.

[![CI](https://github.com/hyperlab-sh/frankstack/actions/workflows/ci.yml/badge.svg)](https://github.com/hyperlab-sh/frankstack/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Published agent stacks such as [Superpowers](https://github.com/obra/superpowers),
[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin),
[AI Hero skills](https://github.com/mattpocock/skills),
[Lavra](https://github.com/roberto-mello/lavra) and
[oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) each solve part of running a
coding agent well. Their pieces do not combine as they are: one skill hands off to the next by
name, a review step expects the plan format its own stack writes, a learning step saves notes where
only its own planner looks.

Frankstack is for developers who want to take pieces from several of them, the way you take parts
of someone else's dotfiles.

## Status

Early. The idea is being tested; there is nothing to install yet.

What exists today is the reading side: a comparison of how six stacks run their loop, step by step,
with every claim linked to the file and line that shows it. It will be served at
<https://frankstack.hyperlab.sh/learn/>.

## How it is meant to work

1. **Pick blocks.** A block is a skill, agent, prompt, script, hook, playbook or resource from a
   published stack. You can also bring a file of your own, or describe a block for your agent to
   write.
2. **Settle what the blocks need.** Blocks rely on shared concepts: where tasks are stored, where
   lessons are kept, how a block says it has finished. You choose the block that provides each
   one, once, and it need not be the one a block was written for.
3. **Get a bundle.** Every block comes with marks at the places where its text names another
   block, uses a concept or passes control. One file holds every choice you made.
4. **Your agent assembles it.** It replaces what the marks point at with what you chose and
   installs the result. From then on it is yours to change.
5. **Check it.** Before and after assembly, Frankstack walks every path through each flow and
   reports, with the path, any step that reads something no earlier step wrote, any loop with no
   bound, any outcome that leads nowhere, and any leftover of a provider you did not choose.

Frankstack does not run your loop, and it does not judge how well a stack performs. It makes stacks
cheap to compose so you can try them.

## Repository layout

- `apps/site`: the website (Marko Run, static build).
- `packages/`: the checker and other tooling, as they are written.
- `docs/`: the bundle format, the language and the catalog.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
