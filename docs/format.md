# Bundle format (v1)

A bundle is a folder a coding agent reads to assemble a stack. Nothing in it runs.

```
README.md                          for the person: what this stack is
AGENTS.md                          for an agent started in this folder: what to do
ASSEMBLE.md                        the rules for writing the stack out
FORMAT.md                          this file
stack.yaml                         the stack: levels, steps, routes, components, blocks
blocks/<origin>/...                the original files of each block, unchanged
annotations/<origin>/<block>.md    what is known about one block
components/<Type>/<name>.md        one card per component
```

`README.md` and `stack.yaml` are written for this stack. `AGENTS.md`, `ASSEMBLE.md` and `FORMAT.md`
are the same in every bundle. Every path in a bundle is written from the bundle root.

## Words

- **Block**: text taken from a published stack, which the assembled stack installs: a skill, an
  agent, a prompt, a script. Its original files are under `blocks/`. A block has an id,
  `<origin>/<block>` (`superpowers/implementer-prompt`).
- **Origin**: the published stack a block was taken from (`superpowers`, `lavra`).
- **Annotation**: what is known about one block: where its text assumes a component, how it can
  end, what it reads and writes. It is a map of the block, never installed.
- **Component type**: a convention the blocks of one stack must share: where tasks live
  (`TaskStorage`), where lessons are kept (`Memory`), how requirements are identified
  (`Requirement`), where decisions are recorded (`Decisions`), how work is handed out
  (`Executor`), how control passes on (`Handoff`), what the stack is installed into (`Harness`).
  The types of a stack are the keys under `components` in `stack.yaml`.
- **Component**: one concrete convention of a type. `components/Memory/learnings-dir.md` (one
  markdown file per lesson in a folder) and `components/Memory/ce-solutions.md` (another stack's
  folder and format) are two components of the type `Memory`. A stack uses exactly one component
  per type. A component is not a file of the stack and is never installed: it is what the blocks'
  text tells the agent to do. Its **card** describes it.
- **Touch**: a place in a block's text that assumes one component.
- **Cell**: one step at one level.
- **Lead**: the skill that runs the loop and decides what runs next. It is written from the block
  with `role: router`.

Why a bundle holds cards the stack does not use: a block written in a stack that keeps its lessons
the `ce-solutions` way has touches that name `components/Memory/ce-solutions.md`. This stack uses
`components/Memory/learnings-dir.md`. The assembler rewrites that text from the first convention to
the second, and needs both cards: one to recognise what the text means, the other to know what to
write. A card is in the bundle because the stack uses it or because a touch names it.

## stack.yaml

```yaml
name: <name>
description: <one sentence>
levels: [<outermost>, ..., <innermost>]   # optional; without it the stack has one level
inside: { <level>: <block id> }           # optional; a level the lead does not run (see below)
start: <step>                             # first step, at the outermost level
ends: [done, escalated]                   # how a loop finishes, at any level
inputs: [<artifact>]                      # what the user provides before the first step
artifacts: { <name>: { scope: cross-run } }   # kept between runs; a first run cannot count on them
components:
  <Type>: components/<Type>/<name>.md     # the one component of this type the stack uses
files:                                    # where each artifact is kept
  <artifact>: <path>                      # the same at every level
  <artifact>: { <level>: <path> }
  counters: <path>                        # where the lead keeps the count of every bounded route
blocks:
  <origin>/<block>: { kind: skill | agent | prompt | script | hook, as: <installed name>, role: router, event: <hook event> }
around:                                   # blocks outside the loop
  - { block: <id>, does: <one sentence> }
steps:
  <step>:
    does: <what happens here, one or two sentences>
    block: <origin>/<block>[#<part>]      # absent or null: the lead does it from `does` alone
    only: [<level>]                       # the step exists at these levels only
    reads: [<artifact> | { artifact: <name>, optional: true }]
    writes: [<artifact>]
    claims: [<name>]                      # taken when the step starts
    releases: [<name>]                    # given back when the step ends, whatever the outcome
    needs: [<Type>.<capability>]
    outcomes:
      <outcome>: <step or end>
      <outcome>: { to: <step or end>, max: <n>, then: <step or end>, releases: [<claim>], resets: [<step>.<outcome>] }
    children:                             # on the step that runs the loop one level down
      done: <step>                        # every child finished
      <other end>: <route>                # a child finished another way
    at:
      <level>: false                      # the step does not exist at this level
      <level>: { <any key above> }        # each key given here replaces the step's own, whole
```

Rules:

- **Levels.** Every step runs at every level unless `only` or `at.<level>: false` says otherwise.
  The step names are the same at every level; what a step does at a level is its `does` there. A
  step that does not exist at a level passes straight to where its first outcome leads.
- **Running the loop one level down.** The step with `children` starts the loop at `start`, one
  level down, once per child. A child that reaches the end `done` returns to that step; a child
  that reaches another end takes the route `children.<end>`. At the innermost level `children`
  is ignored and the step's own `outcomes` apply. At the outermost level the ends are the ends of
  the run.
- **`inside`.** The lead runs every level except the ones listed under `inside`. Such a level
  runs inside the block named, in that block's own context: the lead starts the block once and
  the block runs the level's steps for every child. When a bound of that level is used up, the
  block ends `escalated`, which is `children.escalated` of the cell that uses the block.
- **Artifacts** belong to the level that names them. `child:<name>` is the artifact one level
  down, `parent:<name>` one level up. Names listed under `inputs` or `artifacts` belong to the
  whole stack. A new child starts with nothing but what its parent wrote for it with `child:`.
- **`files`** says where an artifact is kept: a path, or a sentence in parentheses when it is not a
  file (`(the task's worktree)`). `<name>` in a path is filled in by the lead. Where the card of a
  component the stack uses also gives a path, the two agree.
- **Claims.** `claims: [task]` takes the claim when the step starts. A route's `releases` gives it
  back. On a `children` route, `releases: ["child:<name>"]` gives back the claim the child that
  ended still holds.
- **Bounds.** `max: n` lets the route be taken n times while its level's loop runs; after that
  the outcome leads to `then`. A route with `resets: [step.outcome]` sets those counters of the
  same level back to 0. Starting a child starts its counters at 0.
- **Outcomes.** A block reports an outcome and stops. It never names the next block; the lead
  routes. A cell that uses a block routes the names that block's annotation declares (case and
  `_`/`-` do not matter). For the step with `children`, the block's first-end name (`done`) is
  covered by `children.done`. A cell may have both `children` and `outcomes`: `children` routes
  how the level below ended, `outcomes` routes what the cell's own block reports besides.
- **A cell has one block or none.** Without a block the lead does the step from `does`. Whatever
  `does` asks beyond the block's own text is the lead's job too; the block is not rewritten for it.
- **`needs`** is for the checker: it compares each need with the capabilities the component's
  card declares. The assembler does not write it anywhere.

`frankstack-check` is Frankstack's checker, a separate tool that is not in the bundle.
`frankstack-check stack <bundle folder>` reports, each with a path that shows it: a read no step
wrote on some path (including a first run with empty stores), an outcome a block declares that
the stack does not route, a loop with no bound or bounds that reset each other, a step no path
reaches, a step that cannot reach an end, a claim still held at an end, two routers, two hooks on
one event, two blocks installed under one name, a capability that is missing, an artifact that is
written and has no entry in `files`. `frankstack-check expand <bundle folder>` prints the stack
with the levels written out.

## Annotation

`annotations/<origin>/<block>.md`: frontmatter, then free notes for the assembler.

```yaml
---
block: superpowers/implementer-prompt
source: { repo: obra/superpowers, commit: <sha>, path: skills/subagent-driven-development/implementer-prompt.md }
kind: prompt
files:                                    # the block's original files; the first is the main file.
  - blocks/superpowers/implementer-prompt.md   # under blocks/<origin>/ a file keeps the path it has in its origin
parts:                                    # optional: named line ranges a cell can point at with #<part>
  before-you-begin: { lines: "22-30", outcomes: [clear, questions-raised] }
outcomes: [done, blocked]                 # every way the block can end, when it has no parts
touches:
  - component: components/TaskStorage/plan-file-ledger.md   # the card this text was written for
    file: blocks/superpowers/implementer-prompt.md           # needed when the block has several files
    lines: "41-58"                        # one range, or several: "12, 41-58"
    what: Reads the task text from the plan file and ticks a todo-list entry when done.
    verbs: [read-task, mark-done]         # the verbs of the card that the text uses
  - component: components/Executor/subagent.md
    lines: "140-146"
    what: The final message is a short status report.
    change: Add a last bullet for the `OUTCOME:` line.
  - component: components/Handoff/prose-next-skill.md
    lines: "112-118"
    what: Tells the agent to invoke the next skill by name.
    to: [finishing-a-development-branch]
refers:                                   # text that only mentions another skill, agent or command of the origin
  - { name: writing-plans, lines: "8-9" }
other:                                    # a dependency that fits no component type
  - { lines: "61-63", what: Runs `jq` on the questions file. }
needs: [Executor.fresh-context]           # capabilities the block cannot work without
reads: [define]                           # what the block's own text reads and writes
writes: [result]
rewrite: touches | none                   # none: no touch needs rewriting
minutes: 7                                # time the annotator spent; not for the assembler
---
```

How to read a touch: compare its `component` with the card `stack.yaml` lists for that type.

- **The same card.** The text already follows the stack's convention and stays as it is. The
  touch is there to say what the block relies on. When the text must still change for this stack,
  the touch has a `change` key: one or two sentences that say exactly what to do.
- **Another card of the same type.** The text follows a convention the stack does not use. The
  assembler rewrites those lines for the stack's component, using both cards.

Rules for the annotator:

- A touch covers the smallest line range that must change when the component changes. Lines are
  1-based and inclusive, in the file under `blocks/`. Two touches may cover the same lines when the
  text assumes two components; both apply.
- Record every touch, including the ones written for the component the stack uses.
- In a Handoff touch, `what` says which words pass control and what outcome the block reports
  in their place. The assembler replaces those words and keeps the rest of the lines.
- Text that names another skill, agent or command of the origin is a Handoff touch when it passes
  control, and goes under `refers` when it only mentions it.
- A dependency that fits no component type goes under `other` with a sentence. Do not invent a
  component for it. An entry that only describes the dependency changes nothing; an entry that
  says what to write is an order, like `change`.
- The assembler may change a line only where a touch of a card the stack does not use, a touch
  with `change`, a `refers` entry or an `other` entry covers it. A line you leave out is a line it
  must keep.
- Outcomes are the ways the block can end. Use the block's own word when it has one
  (`DONE_WITH_CONCERNS` becomes `done-with-concerns`). Most published blocks end in prose with no
  name: give each distinct ending a short name and say in the notes which sentence it stands for.
  Do not add an ending the text does not describe.
- `reads` and `writes` are the block's own view, in the stack's artifact names where one fits.
  They may differ from the `reads` and `writes` of a cell that uses the block: the cell's are what
  the stack counts on, and the difference is the lead's job.

## Card

`components/<Type>/<name>.md`. The path gives the type and the name.

```yaml
---
capabilities: { write: native, search: emulated }   # native | emulated | missing
fingerprints: ["docs/solutions", "solutions/"]      # strings that betray this component in a text
---
```

The body states, for each verb the blocks use (`write`, `search`, `read-task`, `mark-done`, ...),
how this component does it: the path, the command, the id format, the states. A card the stack
does not use needs only its fingerprints and one line on what it is.

## What the assembler writes

What the Harness card describes (a plugin folder), plus `assembly.json` (for each output file: the
block and the original file it came from, or `generated`) and `ASSEMBLY-REPORT.md` (every decision
the bundle did not determine).
`frankstack-check assembled <folder> --bundle <bundle>` then looks for fingerprints of components
the stack does not use, references that resolve to nothing, bad or duplicate frontmatter, blocks
that never say how to report an outcome, a level under `inside` whose loop was not written into
its block, and original lines changed or removed that no touch, `refers` or `other` entry covers.
A fingerprint or a name from an origin is an error on a line the assembler wrote, and on a line
it left alone inside a touch of a card the stack does not use. On an original line that no touch
covers it is a warning: the annotation missed it. Added lines are not counted, and the lead skill
is not compared with the router block's text: it is written for the stack.
