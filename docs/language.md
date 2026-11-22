# Frankstack's language (draft)

The words Frankstack uses: in its documents, its site, its tools and every bundle. They are defined
here and nowhere else. A stack adds nothing to them and a bundle renames none of them.

A published stack has words of its own ("bead", "PRD", "design doc", "learnings"). The catalog ties
each of them to a concept of this language with a mark in the block's text (`docs/format.md`,
"Marks"). That is what lets two blocks from different stacks be compared and connected.

A copy of this file is in every bundle as `LANGUAGE.md`.

## Terms

- **Stack**: a published agent stack that is in the catalog (Superpowers, Lavra, pstack). What a
  person builds with Frankstack is never called a stack.
- **Catalog**: what Frankstack knows about stacks: each stack split into blocks, each block's text
  with marks (`docs/catalog.md`).
- **Block**: one piece of a stack or of a bundle. Its **kind** is one of: `skill`, `agent`,
  `prompt`, `script`, `hook`, `playbook` (a how-to an agent reads when a block sends it there),
  `resource` (any other file blocks read: a template, a reference).
- **Origin**: where a block comes from. One of three, open to every kind of block:
  - `catalog`: a block of a stack;
  - `imported`: the person's own files;
  - `created`: the person describes it and the assembler writes it.
- **Bundle**: what a person builds: the blocks they chose and every choice about how those blocks
  work together. It is a folder (`docs/format.md`).
- **Assembler**: the person's own coding agent, when it reads a bundle and writes the assembly.
- **Assembly**: what the assembler writes: the files the target loads.
- **Target**: what an assembly is installed into (today one: a Claude Code plugin).
- **Concept**: anything stacks have in common under different names: a thing (a task), a part of
  a thing (what a task asks for), a place where things are kept (`TaskStorage`), a document (a
  plan), a way of working (`Executor`). Every word of a stack that a mark ties to this language is
  tied to a concept. The lists are below.
- **Provider**: the block that provides a concept in a bundle. Other blocks **use** the concept
  and point at the provider. A bundle has at most one provider per concept.
- **Verb**: one thing a block's text does with a concept (`TaskStorage`: `create`, `mark-done`).
- **Trait**: something a provider of a concept has or lacks (`Executor`: `fresh-context`).
- **Artifact**: something one step leaves for another: a document, a list, a code change. Its
  **kind** is a concept from the list below.
- **Reference**: a place where a block's text names another block.
- **Mark**: a tag put into a block's text that says what a passage is, in the terms of this
  language. Marks are placed when a stack is imported and are the same in every bundle.
- **Flow**: a named graph of steps and routes. A bundle has one or more.
- **Step**: one node of a flow. **Level**: one depth at which a flow runs (a workstream, an
  epic, a task). **Cell**: one step at one level.
- **Outcome**: a named way a block or a step can end. **Route**: where an outcome leads.
- **Lead**: the skill or script that runs one flow and decides what runs next.

## Concepts

A concept is defined loosely on purpose: a sentence, and verbs and traits where it has any. The
concepts are listed in three groups, by what a bundle does with them. All of them are concepts,
and any of them can be named in a `fs:concept` mark.

### Concepts a block provides

| Concept | What it is | Verbs | Traits |
|---|---|---|---|
| `TaskStorage` | Where the tasks of the work are kept, with their state. | `create`, `list`, `read-task`, `ready-queue`, `claim`, `mark-done`, `dependencies`, `cite` | |
| `Memory` | Where lessons from earlier runs are kept. | `search`, `read`, `write`, `update`, `delete` | |
| `Decisions` | Where decisions are recorded. | `read`, `write`, `cite` | `numbered` |
| `Requirement` | How each requirement is identified, so that work and checks can point at it. | `list`, `cite`, `verdict` | `stable-ids` |
| `Executor` | How work is given to another agent and how its result comes back. | `dispatch`, `result` | `fresh-context`, `parallel`, `cross-model-review`, `resume` |
| `Routing` | How a block says it has finished, and what then decides which block runs next. | `report` | |

For each of these that its blocks use, a bundle names the provider, and every block that uses the
concept points at it. Or the bundle names no block and leaves the text as written, which works
only when every block that uses the concept was written for the same stack's own way of doing it.

The provider comes from a stack, from the person's own files, or from the person's description,
like any block. Frankstack ships none of its own.

What no provider decides is the shape of a flow: a block ends with a named outcome, and the route
for that outcome says what runs next (`docs/format.md`, "Outcomes"). How the outcome is reported,
and what reads it, is the business of the provider of `Routing`.

`Routing` is not a handoff. Published stacks use "handoff" for a document a session leaves so
that a fresh one can continue; that is the artifact kind `handoff`, below.

`Harness` is what the assembly is installed into. No block provides it: the bundle names a target
and the target's description answers it. Its traits are `skills`, `subagents` and `hooks`.

Verbs:

- `TaskStorage`: `create` adds a task; `list` gives the tasks with their state; `read-task` gives
  the text of one task; `ready-queue` gives the tasks that can start now; `claim` marks a task as
  taken by one worker; `mark-done` marks it finished; `dependencies` records or reads that a task
  waits for another; `cite` names a task by its id in another text.
- `Memory`: `search` finds the lessons that bear on the work at hand; `read` reads one; `write`
  adds one; `update` and `delete` change and remove one.
- `Decisions`: `read` reads the decisions; `write` records one; `cite` names one by its id.
- `Requirement`: `list` gives the requirements; `cite` names one by its id; `verdict` records
  whether one is met.
- `Executor`: `dispatch` gives a piece of work to another agent; `result` reads what it reports.
- `Routing`: `report` ends the block with a named outcome.

Traits:

- `Decisions.numbered`: each decision has a number that never changes.
- `Requirement.stable-ids`: each requirement keeps its id when the list changes.
- `Executor.fresh-context`: the other agent starts without this conversation.
- `Executor.parallel`: several can run at once.
- `Executor.cross-model-review`: a review can run on another model than the work.
- `Executor.resume`: an agent that was given work can be sent another message later, and still has
  what it read and did.
- `Harness.skills`, `.subagents`, `.hooks`: the target loads skills, runs subagents, runs hooks.

### Concepts a provider names

Things, and parts of things. Each belongs to one of the concepts above, and the provider of that
concept says what it calls it: with Lavra's beads, a `Task` is a "bead".

| Concept | What it is | Named by the provider of |
|---|---|---|
| `Task` | One piece of work. | `TaskStorage` |
| `TaskId` | How one task is named in a text: an example (`BD-001`) or a placeholder (`{BEAD_ID}`). | `TaskStorage` |
| `TaskDefinition` | What a task asks for. | `TaskStorage` |
| `Criterion` | One thing that must be true when a piece of work is done, and that can be checked. | `Requirement` |
| `CriterionId` | How one criterion is named in a text. | `Requirement` |
| `Lesson` | One thing learned, kept for later runs. | `Memory` |
| `Decision` | One decision made. | `Decisions` |
| `DecisionId` | How one decision is named in a text. | `Decisions` |

### Artifact kinds

What one step leaves for another.

| Concept | What it is |
|---|---|
| `request` | What the person asks for, in their own words. |
| `requirements` | What must be true when the work is done, with a check for each item. |
| `baseline` | How things are before the work starts. |
| `design` | How the work will be done. |
| `questions` | Questions that must be answered before the work goes on. |
| `plan` | The work split into smaller pieces, in order. |
| `change` | The change itself: a branch, a working tree, a diff. |
| `report` | What a worker says it did. |
| `findings` | The problems a review or a test run found. |
| `verdict` | The decision on a piece of work: accepted, or sent back. |
| `handoff` | A summary of the work so far, written so that a fresh session can continue it. |
| `lessons` | What was learned, kept for later runs. |
| `decisions` | The decisions made, kept for later runs. |

## Where these lists come from, and how they change

The lists are a first version, taken from the twelve blocks and the one flow of the first test
bundle. They have not been tried against a whole stack. The first import (seven blocks of four
stacks) added one term, `Executor.resume`, and proposed eight more that are not added: each is in
the `IMPORT-REPORT.md` of its stack, under "Left unmapped".

Not settled: four artifact kinds name what a provided concept keeps (`plan` and `TaskStorage`,
`requirements` and `Requirement`, `lessons` and `Memory`, `decisions` and `Decisions`), and
`Criterion` sits beside `Requirement`. Each pair may be one concept under two names.

The lists live only in this file, and they grow when stacks are imported. When an import finds
text that no concept or verb fits, it looks for the concept behind it:

- When it is certain, it adds the concept, verb or trait here and marks the text with it. It is
  certain when the thing is not one stack's own invention (another stack has it under another
  name, or any provider of the concept would have it) and it is clear which group it belongs to
  and, for a named concept, which provider names it.
- When it is not, it adds nothing. It marks the passage with what the passage is there for
  (`fs:uses` with `purpose`) and proposes the concept to the operator.

Both go into the import's report, which the operator reviews: what was added and the passages
that led to it, and what was left unmapped with the concept proposed for it, if any
(`docs/catalog.md`, "Importing a stack"). No import removes or renames a term. A change to the
language can require the marks of cataloged blocks to be redone.
