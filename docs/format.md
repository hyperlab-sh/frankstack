# Bundle format (v2, draft)

A bundle is a folder a coding agent reads to write an assembly. Nothing in it runs. The words used
here are defined in `docs/language.md`.

```
README.md                 for the person: what this bundle is
AGENTS.md                 for an agent started in this folder: what to do
CLAUDE.md                 one line, `@AGENTS.md`
ASSEMBLE.md               the rules for writing the assembly
FORMAT.md                 this file
LANGUAGE.md               Frankstack's language: terms, concepts, artifact kinds
bundle.yaml               every choice the person made
targets/<target>.md       what the assembly is installed into
blocks/<name>/...         the files of one block, with marks (none for a block the assembler creates)
licenses/<stack>/LICENSE  the licence of each stack a block was taken from
```

Three kinds of content, never mixed in one file:

- **The same in every bundle**: `AGENTS.md`, `CLAUDE.md`, `ASSEMBLE.md`, `FORMAT.md`,
  `LANGUAGE.md`, and a target's file.
- **Catalog data**: the folder of a catalog block and `licenses/`. A copy, unchanged. It says
  nothing about this bundle.
- **The person's**: `README.md`, `bundle.yaml`, and the folder of an imported block.

The assembler changes a block's text only where a mark is, and only as `bundle.yaml` says
("What the assembler does at a mark"). It is given no other instruction about a block, except the
ones the person wrote under `instructions`.

## bundle.yaml

```yaml
name: <name>
description: <one sentence>
target: claude-code-plugin                  # targets/claude-code-plugin.md
concepts:                                   # for each concept a block uses: the block that provides it
  <Concept>: <block>
  <Concept>: { as-written: <stack> }        # or no block: the text stays as that stack wrote it
artifacts:                                  # kept between runs; a first run cannot count on them
  <name>: { kind: <artifact kind>, scope: cross-run }
blocks:
  <name>:                                   # the name the block is installed under
    from: <stack>/<block>                   # origin catalog: the block's id in the catalog
    origin: imported | created              # when there is no `from`
    references:                             # one entry for each reference the block declares
      <id>: <block>                         # the block of this bundle that stands for it
      <id>: null                            # nothing does; allowed for an optional reference only
    event: <hook event>                     # a hook
    instructions: <the person's own words to the assembler about this block>
    # origin created only: the definition, with the keys of a block header
    kind: skill | agent | prompt | script | hook | playbook | resource
    does: <what the block must do>
    provides: { <Concept>: { verbs: [<verb>], traits: [<trait>] } }
    uses: { <Concept>: { verbs: [<verb>], needs: [<trait>] } }
    inputs: { <name>: { kind: <artifact kind>, required: true } }
    outputs: { <name>: { kind: <artifact kind> } }
    outcomes: { <outcome>: <when the block ends this way> }
flows:
  <flow>:
    description: <one sentence>
    lead: <block>                           # a created block; the assembler writes it from this flow
    levels: [<outermost>, ..., <innermost>] # optional; without it the flow has one level
    inside: { <level>: <block> }            # optional; a created block that runs this level
    start: <step>                           # first step, at the outermost level
    ends: [done, escalated]                 # how the flow finishes, at any level
    inputs: [<artifact>]                    # what the person provides before the first step
    artifacts: { <name>: <artifact kind> }  # the kind of every artifact of the flow
    files:                                  # where each artifact is kept
      <artifact>: <path>                    # the same at every level
      <artifact>: { <level>: <path> }
      counters: <path>                      # where the lead keeps the count of every bounded route
    around:                                 # blocks used outside the steps
      - { block: <name>, does: <one sentence> }
    steps:
      <step>:
        does: <what happens here, one or two sentences>
        block: <name>[#<part>]              # absent or null: the lead does it from `does` alone
        only: [<level>]                     # the step exists at these levels only
        inputs: { <input of the block>: <artifact> }
        outputs: { <output of the block>: <artifact> }
        reads: [<artifact> | { artifact: <name>, optional: true }]   # what the lead itself reads here
        writes: [<artifact>]                # what the lead itself writes here
        claims: [<name>]                    # taken when the step starts
        releases: [<name>]                  # given back when the step ends, whatever the outcome
        needs: [<Concept>.<verb or trait>]  # what the lead's own part of the step cannot do without
        outcomes:
          <outcome>: <step or end>
          <outcome>: { to: <step or end>, max: <n>, then: <step or end>, releases: [<claim>], resets: [<step>.<outcome>] }
        children:                           # on the step that runs the flow one level down
          done: <step>                      # every child finished
          <other end>: <route>              # a child finished another way
        at:
          <level>: false                    # the step does not exist at this level
          <level>: { <any key above> }      # each key given here replaces the step's own, whole
```

A filled-in part, to show what the names stand for:

```yaml
concepts:
  TaskStorage: tasks
blocks:
  plan:
    from: hyper/plan
    references:
      hyper/test-engineer: test-plan        # the text of hyper/plan names hyper/test-engineer
      hyper/ship-config: config
      hyper/kickoff: null
  test-plan: { from: hyper/test-engineer }
  config: { origin: created, kind: script, does: Prints one value of the bundle's configuration. }
  tasks: { from: lavra/beads }
```

The left side of `references` is the id the block's own text was written for. The right side, and
every value under `concepts`, is a key of `blocks` in this file.

Rules:

- **Blocks.** Every block the assembly installs is listed. A block with `from` or
  `origin: imported` has a folder; a `created` one has none, and its definition is its entry here.
  A file two blocks share is a block of its own. A bundle has no two blocks with one name.
- **Concepts.** Each concept some block uses has an entry: the block that provides it, or
  `as-written: <stack>`. The second means the text stays as it is, and is allowed only when every
  block that uses the concept was written for that stack's own way of doing it. `Harness` has no
  entry: the target settles it. A bundle with a flow has a block that provides `Routing`.
- **References.** Every reference a block declares has an entry. A block bound to a reference
  has the kind the reference asks for.
- **`instructions`** is free text by the person, for what substitution cannot express. Frankstack
  never writes it.
- **Flows** share the bundle's blocks, concepts and cross-run artifacts, and nothing else. A
  route leads to a step or an end of its own flow.
- **The lead** of a flow, and a block named under `inside`, are `created` blocks: the assembler
  writes them from the flow, the way the block that provides `Routing` says. A block leads one
  flow at most. A catalog block that routes on its own (a published router) can be installed like
  any block, but no flow is checked for it.
- **Levels.** Every step runs at every level unless `only` or `at.<level>: false` says otherwise.
  The step names are the same at every level; what a step does at a level is its `does` there. A
  step that does not exist at a level passes straight to where its first outcome leads.
- **Running the flow one level down.** The step with `children` starts the flow at `start`, one
  level down, once per child. A child that reaches the end `done` returns to that step; a child
  that reaches another end takes the route `children.<end>`. At the innermost level `children`
  is ignored and the step's own `outcomes` apply. At the outermost level the ends are the ends of
  the run.
- **`inside`.** The lead runs every level except the ones listed under `inside`. Such a level
  runs inside the block named, in that block's own context: the lead starts the block once and
  the block runs the level's steps for every child. When a bound of that level is used up, the
  block ends `escalated`, which is `children.escalated` of the cell that uses the block.
- **Artifacts** belong to the level that names them. `child:<name>` is the artifact one level
  down, `parent:<name>` one level up. Names listed under a flow's `inputs` belong to the whole
  flow, names under the bundle's `artifacts` to the whole bundle. A new child starts with nothing
  but what its parent wrote for it with `child:`.
- **Inputs and outputs.** A cell that uses a block gives an artifact for every required input of
  the block, and may give one for an optional input and for an output. The artifact has the kind
  the block declares. What the cell reads and writes is those artifacts, plus `reads` and `writes`.
  A cell that uses a part (`#<part>`) is not asked for the block's required inputs.
- **`files`** says where an artifact is kept: a path, or a sentence in parentheses when it is not a
  file (`(the task's worktree)`). `<name>` in a path is filled in by the lead. The lead names the
  place of every input and output when it starts a block.
- **Claims.** `claims: [task]` takes the claim when the step starts. A route's `releases` gives it
  back. On a `children` route, `releases: ["child:<name>"]` gives back the claim the child that
  ended still holds.
- **Bounds.** `max: n` lets the route be taken n times while its level runs; after that the
  outcome leads to `then`. A route with `resets: [step.outcome]` sets those counters of the same
  level back to 0. Starting a child starts its counters at 0. A flow with a bounded route gives
  the counts a place: `files.counters`.
- **Outcomes.** A block reports an outcome and stops. It never names the next block; the lead
  routes. How an outcome is reported is the business of the block that provides `Routing`. A cell
  that uses a block routes the names that block declares (case and `_`/`-` do not matter). For the step with `children`, the block's first-end name (`done`) is covered by
  `children.done`. A cell may have both `children` and `outcomes`: `children` routes how the level
  below ended, `outcomes` routes what the cell's own block reports besides.
- **A cell has one block or none.** Without a block the lead does the step from `does`. Whatever
  `does` asks beyond the block's own text is the lead's job too; the block is not changed for it.

## A block's files

`blocks/<name>/` holds every file of the block. Each is the original with marks put in. The main
file starts with the header. In the example the header is real in shape and the text under it is
made up.

```
<fs:block>
id: superpowers/writing-plans
source: { repo: obra/superpowers, commit: "22f0b46", path: skills/writing-plans }
kind: skill
does: Turns an approved design into a plan of small tasks.
files:                                      # every file of the block: the SHA-256 of its original
  SKILL.md: 3b7c…
  plan-template.md: 9e02…
references:                                 # the other blocks the text names
  superpowers/executing-plans: { kind: skill, required: false }
uses:                                       # the concepts the text relies on
  TaskStorage: { written-for: superpowers, verbs: [create], names: [Task] }
  Executor: { written-for: superpowers, verbs: [dispatch], needs: [fresh-context] }
inputs:
  design: { kind: design, required: true }
outputs:
  plan: { kind: plan }
outcomes:                                   # every way the block can end
  done: The plan is saved.
  blocked: The design leaves open a question the plan depends on.
parts:                                      # optional: named passages a cell can use with #<part>
  self-review: { outcomes: { clean: Nothing to fix., fixed: The plan was corrected. } }
assumes:                                    # what the text counts on and no term of the language covers
  - git is installed.
</fs:block>
---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task
---

Save the plan to <fs:artifact name="plan"><fs:path>docs/superpowers/plans/<feature>.md</fs:path></fs:artifact>.

<fs:uses concept="TaskStorage" verb="create">Write each task as a `- [ ]` entry with the exact
files and the test to run.</fs:uses>

Keep every <fs:concept name="Task">task</fs:concept> small enough to finish in one sitting.

<fs:ref to="superpowers/executing-plans">If no subagents are available, use
<fs:name>executing-plans</fs:name> instead.</fs:ref>

<fs:route outcome="done" to="superpowers/subagent-driven-development">Then use
subagent-driven-development to carry out the plan.</fs:route>
```

Header keys:

- `id` is `<stack>/<block>`. An imported block has no `id` and no `source`.
- `source` says where the block's files are in the stack's repository. `commit` is written in
  quotes: without them a commit of digits only is read as a number. `path` is the block's folder,
  or the file itself for a block of one file.
- A block with `fs:route` marks relies on `Routing` and does not list it under `uses` for them.
  It lists `Routing` there when a `fs:uses` mark names it, as for any concept.
- `uses.<Concept>.written-for` says what the text was written for: the id of the block that
  provides the concept in its stack (`lavra/beads`), or the stack's name when the stack has no
  such block and its way of doing it is only in the text of its blocks (`superpowers`). `verbs` lists the verbs
  the marks of this block use, `names` the concepts its text names that the provider of this
  concept has a name for (`docs/language.md`, "Concepts a provider names").
- A block that provides a concept says so, with one sentence per verb. `{name}` stands for the
  name the block is installed under:

  ```yaml
  provides:
    TaskStorage:
      verbs:
        create: "Add each task with `bd create`, as the `{name}` skill describes."
        mark-done: "Close the task with `bd close <id>`."
      names:                                # what this provider calls each concept it names
        Task: bead
        TaskId: "BD-<n>"
        TaskDefinition: "the bead's `## What` section"
      traits: []
      fingerprints: ["bd ", ".beads/"]      # strings that betray this provider in a text
  ```

  The block that provides `Routing` gives `report`, where `{outcome}` stands for the outcome's
  name. Its text also says how the lead of a flow is written; the assembler reads it for that.

- `outcomes` uses the block's own word where it has one (`DONE_WITH_CONCERNS` becomes
  `done-with-concerns`). Where the text ends in prose with no name, each distinct ending gets a
  short name. An ending the text does not describe is not added.
- Nothing in a header mentions a bundle.

### Marks

| Mark | What the passage is |
|---|---|
| `<fs:block>` | The header. Its content is YAML. Once, at the start of the main file. |
| `<fs:ref to="<id>">` | Text that names another block. `to` is a key of `references`. |
| `<fs:name>` | Inside `fs:ref`: the name itself, exactly (a skill's name, a script's path). |
| `<fs:uses concept="<Concept>" verb="<verb>">` | Text that does `verb` with the concept. |
| `<fs:uses concept="<Concept>" purpose="<sentence>">` | Text that depends on how the concept's provider works, does no verb and names no concept. `purpose` says what the passage is there for. |
| `<fs:concept name="<Concept>">` | The stack's words for a concept: "bead" for `Task`, "BD-001" for `TaskId`, "the bead's `## Validation` section" for `Criterion`. |
| `<fs:route outcome="<outcome>" to="<id>">` | Text that passes control to another block. `outcome` is the ending it stands for. |
| `<fs:artifact name="<name>">` | Text about one input or output of the block. |
| `<fs:path>` | Inside `fs:artifact`: the place the text reads it from or writes it to. |
| `<fs:part name="<name>">` | A passage a cell can use on its own. |

How marks are written:

- A mark is an opening tag and a closing tag put into the text. Nothing else in the file changes:
  no escaping, no re-wrapping. The file is not XML. A `<` that does not start `<fs:` or `</fs:`
  is ordinary text.
- Marks nest. Two marks never overlap in part.
- An attribute value is in double quotes and has no `"`, `<`, `>` or line break in it.
- Taking out every tag, and the header with the line break after it, gives the original file byte
  for byte. The SHA-256 under `files` is of that original.
- A file that already contains `<fs:` or `</fs:` cannot be marked.
- Marks go into frontmatter as into any other text: a `description` that says "bead" has the
  same `fs:concept` mark as the body.
- `fs:artifact` has a `fs:path` only where the text gives a literal place. A commit, a reply, or
  a document whose place the caller gives has none.

How marks are placed:

- Every reference, every use of a concept and every passage that passes control is marked,
  whatever a bundle may choose later.
- A mark covers the smallest passage that can be replaced or taken out and leave the text around
  it correct. `fs:uses` and `fs:route` cover whole sentences or list items, because a sentence
  replaces them.
- A mark for something optional (a reference with `required: false`, an input that is not
  required) covers all the text that only makes sense when the thing is there.
- A link is made with the thing's own name: `to` is an id; `concept`, `verb` and the `name` of
  `fs:concept` are terms of the language; the `name` of `fs:artifact` and `fs:part` is a key of
  `inputs`, `outputs` or `parts`. Every name a mark uses is declared in the header, and every
  reference, verb, named concept and part the header declares has a mark.

### What the assembler does at a mark

| Mark | `bundle.yaml` says | The assembler |
|---|---|---|
| `fs:block` | | takes it out. |
| `fs:ref` | the reference is bound to a block | writes that block's name in place of each `fs:name`. |
| `fs:ref` | the reference is bound to `null` | takes the passage out. |
| `fs:uses` | the bundle keeps what the text was written for: the concept's block is the one under `written-for`, or the concept is `as-written` | leaves the text. |
| `fs:uses` with `verb` | another block provides the concept | writes that block's sentence for the verb in place of the passage. |
| `fs:uses` with `purpose` | another block provides the concept | rewrites the passage so that its purpose is met with that block, takes it out when the purpose does not apply, or keeps it when it still holds; lists the passage in the report. |
| `fs:concept` | the concept is one a provider names, and the bundle keeps what the text was written for | leaves the words. |
| `fs:concept` | the concept is one a provider names, and another block is that provider | writes that block's name for the concept, in the same number and case; the concept's name as ordinary words ("task") when the block gives none. |
| `fs:concept` | any other concept | leaves the words. The mark only says what they mean. |
| `fs:route` | a block provides `Routing` | writes that block's `report` sentence, with the outcome's name, in place of the passage. |
| `fs:route` | `Routing` is `as-written` | leaves the text. |
| `fs:artifact` | the cell gives an artifact for it | writes the artifact's place in place of each `fs:path`. Where cells that use the block give different places: "the place the lead gives for `<name>`". |
| `fs:artifact` | cells use the block and none gives one (optional only) | takes the passage out. |
| `fs:artifact` | no cell uses the block | leaves the text. |
| `fs:part` | | leaves the text. |

Then it takes out every tag that is left. Where the block that provides `Routing` says so, it
adds to each block a cell uses one section that lists the block's outcomes and how to report one.
Text outside a mark is copied as it is, except the frontmatter, which the assembler writes as the
target's file says. What replaces a passage stands in its place, never beside it.

A passage that relies on a concept is one of three things:

- it does a verb (`fs:uses` with `verb`): the provider has a sentence ready for it;
- it names a concept (`fs:concept`): the provider has a name ready for it;
- it does neither, and still depends on how the provider it was written for works (`fs:uses` with
  `purpose`). A skill written for a driver that runs units on hosts says "At most `hosts.<h>.slots`
  units run on a host at once." With subagents there are no hosts and no slots, and no provider
  has a sentence for this.

In the third the assembler writes text of its own into a catalog block. That cannot be ruled
out, and no check reports it. `purpose` says what the passage is there for ("limits how many
units run at once"); the providing block's text says how that is done in this bundle, or that it
does not apply. The assembler rewrites the passage, takes it out, or keeps it when it still
holds, and says which in its report. A person who wants a say writes `instructions` for the
block. The import keeps this case small: it looks for the concept behind each such passage and
extends the language where it can (`docs/language.md`, "Where these lists come from").

## Target

`targets/<target>.md` is the same in every bundle with that target. It says, for each kind of
block, where its files go in the assembly, how its name is written in a text (what replaces
`fs:name` and `{name}`), and what frontmatter it must have; where a hook is registered; and which
`Harness` traits the target has. v2 has one target, `claude-code-plugin`. A block written for
another harness is not adapted.

## What the assembler writes

The assembly, as the target's file describes it, plus:

- `assembly.json`: for each file written, the block, and the file of the block it came from or
  how it was made (below);
- `ASSEMBLY-REPORT.md`: every decision the bundle did not determine; every block it created; for
  a created block that provides a concept, the sentence it wrote for each verb; every passage
  marked `fs:uses` with `purpose` under another provider, with what it did (rewrote, took out,
  kept) and the text before and after;
- `LICENSES/`: a copy of `licenses/`.

A created block is written from its definition and from the passages of the other blocks that are
bound to it: it must work as those passages use it.

`assembly.json` has one key, `files`. Each entry is a path in the assembly:

```json
{
  "files": {
    "skills/plan/SKILL.md": { "block": "plan", "file": "SKILL.md" },
    "scripts/config.sh": { "block": "config", "origin": "created" },
    "skills/lead/SKILL.md": { "block": "lead", "origin": "lead" }
  }
}
```

- `block` is a key of `blocks` in `bundle.yaml`.
- A file written from a file of the block has `file`: that file's name in `blocks/<name>/`.
  Every file of every block with a folder has an entry.
- A file of a `created` block has `origin` instead: `lead` when the block leads a flow,
  `created` otherwise.
- The assembler's own files have no entry: `assembly.json`, `ASSEMBLY-REPORT.md`, `LICENSES/`,
  and the files the target's file asks for (`.claude-plugin/plugin.json`, `hooks/hooks.json`).

## Checks

`frankstack-check` is Frankstack's checker, a separate tool that is not in the bundle.

`frankstack-check bundle <folder>` reports:

- **Blocks**: a block with no folder, a folder with no block, a folder for a `created` block; a
  file whose text without marks does not have the SHA-256 the header gives; a tag that is not
  closed, overlaps another or is unknown; a name in a mark the header does not declare, and the
  reverse; a concept, verb or trait that is not in the language.
- **Choices**: a reference with no entry, bound to a name that is no block, bound to a block of
  another kind, or required and bound to `null`; a concept in use with no entry, or whose block
  does not provide it; `as-written` for a concept when a block that uses it was written for
  something else; a flow in a bundle where no block provides `Routing`; a verb in use that the
  provider lacks, a trait needed that it lacks; as a warning, a concept a block names for which
  the provider gives no name; two hooks on one event; a block that leads two
  flows.
- **Each flow**, with a path that shows it: a required input with no artifact, or an artifact of
  another kind; a read no step wrote on some path (including a first run, where nothing kept
  between runs exists yet); an outcome a block declares that the flow does not route; a cycle with
  no bound, or bounds that reset each other; a step no path reaches; a step that cannot reach an
  end; a claim still held at an end; an artifact that is written and has no entry in `files`; a
  bounded route in a flow with no `files.counters`. As warnings: an artifact that is written and
  never read; an outcome a cell routes that its block does not declare.

`frankstack-check expand <folder>` prints each flow with its levels written out.

`frankstack-check assembled <folder> --bundle <bundle> [--catalog <catalog>]` reports: text
outside a mark that was changed, moved or removed (frontmatter is not compared); a mark that was
not handled as the table says, or a passage kept beside the sentence that replaces it; a `fs:`
tag left in the assembly; a name that resolves to no installed block; a block a cell uses that
never says how to report an outcome; a file of a block, a `created` block or a lead that was not
written or has no entry in `assembly.json`; `assembly.json`, the report or a licence that is
missing; bad or duplicate frontmatter.

Warnings: a file of the assembly that `assembly.json` does not list; a fingerprint of a provider
the bundle does not use (the import missed a mark, or a passage was kept). The fingerprints of a
provider that is not in the bundle are read from the catalog; without `--catalog` the checker
says that it did not look for them.

A passage marked with `purpose` is never reported, whatever the assembler did with it. The
checks of names and frontmatter are those of the target `claude-code-plugin`. The checker cannot
tell whether a created block does what its definition says.

`frankstack-check catalog <stack folder> --source <clone>` checks one stack of the catalog
against its repository (`docs/catalog.md`, "Importing a stack").
