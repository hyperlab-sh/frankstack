# The catalog, and how a bundle is built from it (draft)

A block is handled three times, by three hands. Each one does a different kind of work, and only
the first needs a strong model.

| When | Who | What they do | Result |
|---|---|---|---|
| A stack is imported | a strong model, reviewed by the operator | splits the stack into blocks, marks each block's text, and extends the language where the stack shows a concept it lacks | the catalog, and a report |
| A person builds | the person, in Frankstack | chooses blocks and settles what each one needs | a bundle |
| The bundle is assembled | the person's own agent | replaces what the marks point at with what the person chose | an assembly |

The words used here are defined in `docs/language.md`, the bundle in `docs/format.md`.

## The catalog

```
catalog/<stack>/stack.yaml      the stack: repository, commit, licence, date of the import
catalog/<stack>/LICENSE         the stack's licence, as its authors wrote it
catalog/<stack>/IMPORT-REPORT.md  what the import added to the language and what it left unmapped
catalog/<stack>/<block>/...     the files of one block, with marks; the header is in the main file
```

`stack.yaml` has four required keys, and `pending` when the stack is not imported whole:

```yaml
repository: obra/superpowers
commit: "22f0b46…"        # in quotes: a commit of digits only is a number otherwise
licence: MIT
imported: 2026-11-22
pending:                  # blocks that are not imported yet: the name of each, and where it is
  writing-skills: skills/writing-skills
```

- A stack may be imported in part. A block that an imported text references or routes to, and
  that is not imported, is listed under `pending` with its path in the repository: its folder,
  or the file itself. The reference keeps its mark and its id, `<stack>/<name>`. When the block
  is imported it leaves the list.

- The catalog holds every file of every block, complete, with marks. Without the marks a file is
  the stack's file byte for byte.
- A block's folder is named after its id: `catalog/<stack>/<block>/` holds `<stack>/<block>`.
  Its header gives `source`: the stack's repository and commit, and the block's folder in the
  repository, or the file itself for a block of one file.
- Nothing in the catalog mentions a bundle. A bundle gets a copy of a block's folder, unchanged.
- An entry changes when the stack's source changes (a new import at a new commit) or when the
  language changes. It never changes because of what a person builds.
- A stack is imported only when its licence allows its files to be copied and changed. Its
  `LICENSE` goes with its blocks into every bundle and every assembly.
- The catalog holds only what stacks published. Frankstack writes no block of its own. A piece no
  stack has is brought or described by the person who builds the bundle. If Frankstack ever
  offers one, it will be because research showed which one works.

## Importing a stack

1. **Pin.** Record the repository and the commit. Copy the licence.
2. **Split.** Every piece the stack installs becomes a block: a skill, an agent, a prompt, a
   script, a hook, a playbook, a resource. A file several blocks use is a block of its own. Every file of the
   stack ends up in one block or is listed as left out, with the reason. When only some blocks
   are imported, the blocks their text points at go under `pending` in `stack.yaml`, and the
   report says that the import is partial.
3. **Mark.** For each block, write the header and put the marks into the text
   (`docs/format.md`, "A block's files"): what it references, which concepts it uses and with
   which verbs, where it passes control, what it reads and writes, how it can end. The stack's
   words for a concept are tied to it with `fs:concept`. Where text relies on something no
   concept or verb of the language fits, the import looks for the concept behind it
   (`docs/language.md`, "Where these lists come from, and how they change"):
   - certain that it is a concept of its own: it adds the concept, verb or trait to the language
     and marks the text with it;
   - not certain: it adds nothing, marks the passage with `purpose` (one sentence on what the
     passage is there for) and proposes the concept in the report.
   When several stacks are imported at once, whoever marks one stack does not change the
   language: they mark such a passage with `purpose` and say in the report whether they are
   certain. A term is added after every stack is marked, when it shows in more than one stack or
   its place in the language is clear, and the passages are marked again.
   What the block counts on outside any concept (git is installed) is listed under `assumes`.
4. **Providers.** Where the stack has a piece of its own for a concept (a skill for its task
   tool, a script), that block gets `provides`: one sentence per verb, and its name for each
   concept it names. Where it has none,
   because its way of keeping tasks is spread over the text of several skills, nothing is
   written: step 3 marked every place, and `written-for` there is the stack's name. The import
   never writes text on a stack's behalf.
5. **Check.** `frankstack-check catalog <stack folder> --source <clone>`: the stack has its
   `stack.yaml`, `LICENSE` and `IMPORT-REPORT.md`; every block's header names its folder, the
   stack's repository and the pinned commit; each file without its marks is the file at that
   commit; every tag is closed and known; what the header declares and what the marks use agree;
   every reference and every `to` of a route is a block of the stack, imported or listed under
   `pending` at a path the source has; every term is in the
   language; no fingerprint of one of the stack's providers is left outside a mark that ties the
   passage to it (`fs:uses` of that concept, `fs:concept` of the concept or of a name it owns,
   `fs:ref` to the provider). As a warning: the mark of an optional reference that covers only
   its name.
6. **Report.** `catalog/<stack>/IMPORT-REPORT.md`, for the operator to review:
   - **Added to the language**: each concept, verb or trait the import added, its definition, and
     the passages that led to it. The operator keeps it, renames it or takes it back.
   - **Left unmapped**: each passage marked with `purpose`, with the concept the import would
     propose for it, if any, and why it was not certain. The operator decides whether the
     language gets the concept.
   - The files left out and why, and the time each block took.
   A decision of the operator that changes the language is applied to the marks of every block
   it touches.

## Building a bundle

Each step names who gives the information. Today every step is done by hand.

1. **The person picks blocks.** From the catalog; from their own files; or by describing one.
2. **Frankstack copies** each catalog block's folder into `blocks/<name>/`, unchanged. A file the
   person brought is marked by a strong model with the rules of "Importing a stack", step 3, and
   put into `blocks/<name>/`.
3. **Frankstack makes the person settle what the blocks need**, and offers nothing else:
   - for each concept a picked block uses, the block that provides it; or, when every picked
     block that uses it was written for one stack's own way of doing it, that the text stays as
     written;
   - for each reference of each block, the block that stands for it, or nothing when the
     reference is optional;
   - the flows: steps, routes, bounds, levels;
   - for each input of each block a cell uses, the artifact it gets.
   In every case the block can come from the catalog, from the person's files, or be described.
4. **The person may add instructions** to a block, in their own words.
5. **Frankstack writes** `bundle.yaml` and `README.md`, and copies the files that are the same in
   every bundle, the target's file and the licences.
6. **Check.** `frankstack-check bundle <folder>` must report no error.

## What is not known yet

- No stack has been imported whole. The first import took seven blocks of four stacks
  (`superpowers` 4, `compound-engineering` 1, `lavra` 1, `pstack` 1; 1,324 lines), each stack
  marked by one agent that had the documents and the clone and nothing else. All four pass the
  check. The agents report 3 to 10 minutes a stack, about 21 in all. They placed 96 `fs:concept`
  marks, 11 `fs:uses` marks with a verb and 27 with `purpose`: 13 in the three `superpowers`
  prompts (`Executor` and `Routing`), 13 in the `compound-engineering` agent (`Memory`), 1 in
  `pstack`, none in `lavra`. They proposed nine terms and called one certain, which is now in the language. `superpowers`
  lists five blocks under `pending`. No stack has one block that provides a concept:
  `written-for` is the stack's name in every header, and step 4 has not been done once.
- The import left these questions open. Each is in a report, under "Gaps in the documents":
  - A line that reports any of several outcomes (`Status: DONE | BLOCKED | …`) cannot be a
    `fs:route`, which stands for one outcome. It is marked `fs:uses` with `purpose` for now.
  - `fs:route` needs a block to pass control to. A prompt or an agent that only answers its
    caller has none in its text: one import named the block that dispatches it, two wrote no
    route.
  - A `purpose` mark needs a concept, and some passages rely on something no concept is close to
    (a project glossary, a set of rule files).
  - No artifact kind fits one task's text, the caller's description of the work, or a search
    result that is not kept; and one output can be both `findings` and `verdict`.
  - Whether the repository's agent instruction file (`AGENTS.md`, `CLAUDE.md`) is `Memory`.
  - `fs:uses` covers whole sentences, and a sentence can also say something the provider's
    sentence drops. An output's `fs:artifact` passage is taken out when no cell gives the
    output, which can take an instruction with it.
  - A verb mark over several headed sections leaves "Step 3" in other passages pointing at
    text that is gone.
- The twelve blocks of the first test bundle were mapped by
  hand, under format v1. In those maps 62 uses of `TaskStorage`, `Memory`, `Decisions`,
  `Requirement` and `Executor` name no verb, and 48 of them, in 8 of the 12 blocks, were written
  for a provider that bundle does not use. Read one by one, about 13 of the 48 are a stack's
  words for a concept and become `fs:concept` marks. About 35 depend on how one provider works;
  25 of those are in three skills written around one stack's own way of running work. How many
  of the 35 an import turns into concepts, and how many stay marked with `purpose`, is not
  known.
- No assembly has been run from a bundle in this format. The three assemblies that passed under
  v1 had instructions written by hand for exactly those passages, so how well an assembler
  rewrites a passage from its `purpose` and the providing block alone is not known.
