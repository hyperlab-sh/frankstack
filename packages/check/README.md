# @frankstack/check

Checks a stack bundle before an agent assembles it, and the plugin the agent wrote afterwards.
The bundle format is in [`docs/format.md`](../../docs/format.md).

```sh
bun packages/check/src/cli.ts stack <bundle folder>       # the stack definition
bun packages/check/src/cli.ts expand <bundle folder>      # the stack with its levels written out
bun packages/check/src/cli.ts assembled <plugin folder> --bundle <bundle folder>
```

Exit code 1 when there is an error, 64 on a usage mistake.

## What `stack` reports

Every finding that depends on the order of steps comes with the path that shows it.

| Rule | Meaning |
|---|---|
| `read-before-write` | on some path a step reads an artifact no earlier step wrote |
| `first-run-read` | a step requires an artifact kept between runs; the first run has none |
| `no-writer` | an artifact is read, written by no step, and not an input |
| `unrouted-outcome` | a block can end in a way the stack does not route, or a child level can end in a way its parent does not route |
| `unbounded-cycle` | a loop with no bound |
| `bounds-reset` | a loop whose bounds set each other back, so none of them holds |
| `bound-without-route` | a bound with nowhere to go once it is used up |
| `leaked-claim` | a path reaches an end still holding a claim |
| `unreachable-step`, `dead-end`, `end-unreachable` | a step no path reaches, a step with no way out, a step that cannot reach an end |
| `two-routers`, `name-clash`, `hook-clash` | two routers, two blocks installed under one name, two hooks on one event |
| `missing-capability` | a step needs a capability the chosen implementation lacks |
| `invalid` | the file does not follow the format |

Warnings: `never-read`, `emulated-capability`, `undeclared-outcome`.

## What `assembled` reports

| Rule | Meaning |
|---|---|
| `missing-file`, `missing-block` | `plugin.json` or `assembly.json` is missing, or a block is not at the path its kind gives |
| `bad-frontmatter`, `name-clash` | a skill or agent without `name` and `description`, named differently from its folder, or sharing a name |
| `leftover` | a fingerprint of an implementation the stack replaced |
| `home-reference` | `stack:name` pointing at the stack a block came from |
| `unresolved-path`, `unresolved-handoff` | a `${CLAUDE_PLUGIN_ROOT}` path or a skill of this plugin that does not exist; a block or level the lead skill never names |
| `absolute-path` | a path into a home directory or a plugin cache |
| `missing-outcome` | a block of the loop that never says how to report its outcome |

Warnings: `unlisted-file`, `uncovered-change` (source lines changed that no touch, `refers` or
`other` entry covers).

`leftover` and `home-reference` are errors on a line the assembler wrote, and on a line it left
alone inside a touch of a replaced implementation. On a line copied from the source that no
touch covers they are warnings: the annotation missed the line, and the assembler was right to
keep it. Output lines are traced to source lines through `diff -U0`.

## How it works

The levels are written out into one flat graph: a node per step per level, and an edge per
outcome. A bounded route becomes two edges, one taken while the bound holds and one after. The
step that runs the loop one level down gets an edge to the child's start, bounded by the number
of children, and an edge for when all are done.

- Reads: a forward analysis of which artifacts are written on every path into a node; a
  breadth-first search then finds the shortest path that shows a missing one.
- Loops: every strongly connected component must lose its cycles when its bounded edges are
  removed, and no edge left inside may reset a bound of that component.
- Claims: a search over (node, claims held) for an end reached with one still held.

The check is about the definition. Whether an agent follows it is out of scope.

## Tests

```sh
bun test packages/check/tests
```

Each test seeds one defect into a sound stack and expects that finding and no other.
