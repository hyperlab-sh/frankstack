# Bundle format (v0)

A bundle is a folder a coding agent reads to assemble a stack. Nothing in it runs.

```
stack.yaml                        the stack: levels, steps, routes, component choices, blocks
blocks/<stack>/<block>.md         one annotation per block taken from a published stack
components/<Component>/<impl>.md  one card per implementation, chosen or replaced
sources/                          the original files of each block, unchanged
ASSEMBLE.md                       instructions for the assembling agent
README.md                         the design, for the person who reviews the bundle
```

Words used here:

- **Block**: a unit taken from a stack: a skill, an agent, a prompt, a script.
- **Component**: something a block depends on that the user picks once for the whole stack
  (where tasks live, where lessons are kept, how control passes on).
- **Implementation**: one concrete way to provide a component (`beads`, `tasks-md`).
- **Touch**: a place in a block's text that assumes one implementation of a component.
- **Cell**: one step at one level.

## stack.yaml

```yaml
name: <name>
levels: [<outermost>, ..., <innermost>]   # optional; without it the stack has one level
start: <step>                             # first step, at the outermost level
ends: [done, escalated]                   # how a loop finishes, at any level
inputs: [<artifact>]                      # what the user provides before the first step
artifacts: { <name>: { scope: cross-run } }   # kept between runs; a first run cannot count on them
components:
  <Component>:
    impl: <chosen implementation>
    replaces: [<implementation a block was written for>]
    capabilities: { <capability>: native | emulated | missing }
blocks:
  <stack>/<block>: { kind: skill | agent | prompt | script | hook, as: <installed name>, role: router, event: <hook event> }
around:                                   # blocks outside the loop
  - { block: <id>, does: <one sentence> }
steps:
  <step>:
    does: <what happens here, one or two sentences>
    block: <stack>/<block>[#<part>]       # absent: the lead does it from `does` alone
    only: [<level>]                       # the step exists at these levels only
    reads: [<artifact> | { artifact: <name>, optional: true }]
    writes: [<artifact>]
    claims: [<name>]                      # taken when the step starts
    releases: [<name>]                    # given back when the step ends, whatever the outcome
    needs: [<Component>.<capability>]
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
  A step that does not exist at a level passes straight to where its first outcome leads.
- **Running the loop one level down.** The step with `children` starts the loop at `start`, one
  level down, once per child. A child that reaches the end `done` returns to that step; a child
  that reaches another end takes the route `children.<end>`. At the innermost level `children`
  is ignored and the step's own `outcomes` apply. At the outermost level the ends are the ends of
  the run.
- **Artifacts** belong to the level that names them. `child:<name>` is the artifact one level
  down, `parent:<name>` one level up. Names listed under `inputs` or `artifacts` belong to the
  whole stack. A new child starts with nothing but what its parent wrote for it with `child:`.
- **Bounds.** `max: n` lets the route be taken n times in one pass of its level; after that the
  outcome leads to `then`. Starting a new child resets the bounds below it.
- **Outcomes.** A block reports an outcome and stops. It never names the next block; the lead
  skill routes. A cell that uses a block routes the names that block's annotation declares (case
  and `_`/`-` do not matter). For the step with `children`, the block's first-end name (`done`)
  is covered by `children.done`.
- **A cell has one block or none.** Without a block the lead does the step from `does`. Whatever
  `does` asks beyond the block's own text is the lead's job too; the block is not rewritten for it.

`frankstack-check stack <bundle folder>` reports, each with a path that shows it: a
read no step wrote on some path (including a first run with empty stores), an outcome a block
declares that the stack does not route, a loop with no bound or bounds that reset each other, a
step no path reaches, a step that cannot reach an end, a claim still held at an end, two routers,
two hooks on one event, two blocks installed under one name, a capability that is missing.
`frankstack-check expand <bundle folder>` prints the stack with the levels written out.

## Block annotation

`blocks/<stack>/<block>.md`: frontmatter, then free notes for the assembler.

```yaml
---
block: superpowers/implementer-prompt
source: { repo: obra/superpowers, commit: <sha>, path: skills/subagent-driven-development/implementer-prompt.md }
kind: prompt
files:                                    # bundle-relative; the first is the main file
  - sources/superpowers/implementer-prompt.md
parts:                                    # optional: named line ranges a cell can point at with #<part>
  before-you-begin: { lines: "22-30", outcomes: [clear, questions-raised] }
outcomes: [done, blocked]                 # every way the block can end, when it has no parts
touches:
  - component: TaskStorage
    impl: plan-file-ledger                # the implementation this text was written for
    file: sources/superpowers/implementer-prompt.md   # needed when the block has several files
    lines: "41-58"                        # one range, or several: "12, 41-58"
    what: Reads the task text from the plan file and ticks a todo-list entry when done.
    verbs: [read-task, mark-done]
  - component: Executor
    impl: subagent                        # the stack's own choice: the text stays...
    lines: "140-146"
    what: The final message is a short status report.
    change: Add a last bullet for the `OUTCOME:` line.   # ...unless `change` says what to do
  - component: Handoff
    impl: prose-next-skill
    lines: "112-118"
    what: Tells the agent to invoke the next skill by name.
    to: [finishing-a-development-branch]
needs: [Executor.fresh-context]           # capabilities the block cannot work without
reads: [define]                           # artifacts, in the stack's own names where one fits
writes: [result]
rewrite: touches | none                   # none: no line of the source changes
minutes: 7                                # time spent writing this annotation
---
```

Rules for the annotator:

- A touch covers the smallest line range that must change when the implementation changes. Lines
  are 1-based and inclusive, in the file under `sources/`.
- Record every touch, including the ones the chosen implementation leaves unchanged (`impl`
  equal to the stack's choice): they say what the block relies on.
- A touch written for the chosen implementation is left alone by the assembler. When its text
  must still change for this stack (a block that reports a status where the stack wants an
  outcome line), give the touch a `change` key: one or two sentences that say exactly what to
  do. The assembler does that and nothing more.
- In a Handoff touch, `what` says which words pass control and what outcome the block reports
  in their place. The assembler replaces those words and keeps the rest of the lines.
- Text that names another skill, agent or command of the home stack is a Handoff touch when it
  passes control, and goes under `refers` (a list of `{ name, lines }`) when it only mentions it.
- A dependency that fits no listed component goes under `other` (a list of `{ file, lines, what }`)
  with a sentence. Do not invent a component for it.
- The assembler may change a source line only where a touch of a replaced implementation, a
  touch with `change`, a `refers` entry or an `other` entry covers it. A line you leave out is a
  line it must keep.
- Outcomes are the ways the block can end. Use the block's own word when it has one
  (`DONE_WITH_CONCERNS` becomes `done-with-concerns`). Most published blocks end in prose with no
  name: give each distinct ending a short name and say in the notes which sentence it stands for.
  Do not add an ending the text does not describe.

## Implementation card

`components/<Component>/<impl>.md`:

```yaml
---
component: Memory
impl: learnings-dir
status: chosen | replaced
capabilities: { write: native, search: emulated }
fingerprints: ["docs/solutions", "solutions/"]   # strings that betray this implementation
---
```

The body states, for each verb the blocks use (`write`, `search`, `read-task`, `mark-done`, ...),
how this implementation does it: the path, the command, the id format, the states. A replaced
implementation needs only its fingerprints and one line on what it is.

## What the assembler writes

A plugin folder, plus `assembly.json` (for each output file: the block and source file it came
from, or `generated`) and `ASSEMBLY-REPORT.md` (every decision the bundle did not determine).
`frankstack-check assembled <folder> --bundle <bundle>` then looks for fingerprints of replaced
implementations, references that resolve to nothing, bad or duplicate frontmatter, blocks that
never say how to report an outcome, and source lines changed or removed that no touch, `refers`
or `other` entry covers. A fingerprint or a home-stack reference is an error on a line the
assembler wrote, and on a line it left alone inside a touch of a replaced implementation. On a
source line that no touch covers it is a warning: the annotation missed it.
Added lines are not counted, and the router is not compared with its source: it is written for
the stack.
