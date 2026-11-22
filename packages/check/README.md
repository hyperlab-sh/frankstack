# @frankstack/check

Checks a bundle before an agent assembles it, the assembly the agent wrote, and a stack of the
catalog against its source. The formats are in [`docs/format.md`](../../docs/format.md) and
[`docs/catalog.md`](../../docs/catalog.md), the terms in [`docs/language.md`](../../docs/language.md).

```sh
bun packages/check/src/cli.ts bundle <bundle folder>
bun packages/check/src/cli.ts expand <bundle folder>      # each flow with its levels written out
bun packages/check/src/cli.ts assembled <assembly folder> --bundle <bundle folder> [--catalog <catalog folder>]
bun packages/check/src/cli.ts catalog <stack folder> --source <clone of the stack's repository>
```

Exit code 1 when there is an error, 64 on a usage mistake. A warning does not fail.

## What `bundle` reports

About the blocks:

| Rule | Meaning |
|---|---|
| `no-folder`, `unlisted-folder`, `created-folder` | a block with no folder, a folder with no block, a folder for a `created` block |
| `bad-header` | no header, more than one, or a header that does not follow the format |
| `wrong-block`, `duplicate-block` | a folder that holds another block than `from` says; a name listed twice |
| `hash-mismatch`, `unlisted-file`, `missing-file` | a file that is not the original once its marks are taken out; a file the header does not list, or lists and is not there |
| `bad-mark` | a tag that is not closed, overlaps another or is unknown |
| `undeclared-name`, `unmarked-name` | a name in a mark that the header does not declare, and the reverse |
| `unknown-term` | a concept, verb, trait or kind that is not in the language |

About the choices:

| Rule | Meaning |
|---|---|
| `unbound-reference`, `unknown-block`, `wrong-kind`, `required-reference` | a reference with no entry, bound to a name that is no block, bound to a block of another kind, or required and bound to `null` |
| `no-provider`, `not-a-provider` | a concept in use with no entry, or whose block does not provide it |
| `not-as-written` | `as-written` for a concept that some block was not written for |
| `no-routing` | a flow in a bundle where no block provides `Routing` |
| `missing-verb`, `missing-trait` | a verb in use, or a trait needed, that the provider lacks |
| `hook-clash` | two hooks on one event |
| `not-created`, `two-flows` | a lead that is not a `created` block; a block that leads two flows |
| `invalid` | `bundle.yaml` does not follow the format |

About each flow, with the path that shows it:

| Rule | Meaning |
|---|---|
| `missing-input`, `artifact-kind`, `no-kind` | a required input with no artifact, an artifact of another kind, an artifact with no kind |
| `read-before-write` | on some path a step reads an artifact that no earlier step wrote |
| `first-run-read` | a step requires an artifact kept between runs; the first run has none |
| `no-writer` | an artifact that is read, written by no step, and not an input |
| `unrouted-outcome` | a block can end in a way the flow does not route, or a child level can end in a way its parent does not route |
| `unbounded-cycle`, `bounds-reset` | a loop with no bound; a loop whose bounds set each other back |
| `bound-without-route` | a bound with nowhere to go once it is used up |
| `unreachable-step`, `dead-end`, `end-unreachable` | a step no path reaches, a step with no way out, a step that cannot reach an end |
| `leaked-claim` | a path reaches an end still holding a claim |
| `no-path` | an artifact that is written and has no place under `files`; a bounded route with no `files.counters` |

Warnings: `unnamed-concept` (a block names a concept and the provider gives no name for it),
`never-read` (an artifact that is written and never read), `undeclared-outcome` (a cell routes an
outcome its block does not declare).

## What `assembled` reports

| Rule | Meaning |
|---|---|
| `changed-text` | text outside a mark that was changed, moved or removed |
| `unhandled-mark` | a marked passage that is not what `bundle.yaml` asks for there, or that was kept beside the sentence that replaces it |
| `leftover-tag` | a `fs:` tag left in the text |
| `unresolved-name` | `<plugin>:<name>` where no block is installed under that name |
| `missing-outcome` | a block a cell uses that never says how to report an outcome |
| `not-written` | a file of a block, a `created` block or a lead that `assembly.json` does not account for |
| `bad-frontmatter` | a skill or agent without `name` and `description`, with a key given twice, named differently from its folder or its block, or sharing a name |
| `missing-file` | `assembly.json`, `ASSEMBLY-REPORT.md`, a licence or the plugin's manifest is missing; `assembly.json` lists a file that is not there |
| `unknown-block`, `invalid` | `assembly.json` names a block the bundle does not have, or does not follow its format |

Warnings: `unlisted-file` (a file `assembly.json` does not list), `leftover-fingerprint` (a string
that betrays a provider the bundle does not use), `fingerprints-not-checked` (that provider is not
in the bundle, and `--catalog` was not given or does not have it).

The text of each file is compared with its block's file phrase by phrase: the phrases outside
marks must be there, in order, and what stands between two of them is what the assembler wrote
for the mark. Frontmatter is not compared. A passage marked `fs:uses` with `purpose` is never
reported: the assembler writes it, and no check can tell whether it wrote it well.

## What `catalog` reports

| Rule | Meaning |
|---|---|
| `invalid`, `missing-file` | `stack.yaml` does not follow its format; `LICENSE` or `IMPORT-REPORT.md` is missing; the stack has no block |
| `missing-source` | the clone does not have the commit the stack is pinned at |
| `bad-header`, `wrong-block` | a block without `id` and `source`, from another repository or commit, or in a folder that is not its id's |
| `source-mismatch` | a file that, without its marks, is not the file at the pinned commit |
| `unknown-block` | a reference or a route to a block the stack does not have, imported or listed under `pending`; a `pending` path the source does not have |
| `unmarked-fingerprint` | a string that betrays one of the stack's providers, outside any mark that ties the passage to it |

It also reports, for every block, what `bundle` reports about a block.

## How it works

The levels of a flow are written out into one flat graph: a node per step per level, and an edge
per outcome. A bounded route becomes two edges, one taken while the bound holds and one after.
The step that runs the flow one level down gets an edge to the child's start, bounded by the
number of children, and an edge for when all are done.

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

Each test seeds one defect into a sound bundle, assembly or stack and expects that finding and no
other.
