# Import report: compound-engineering

## 1. What was imported

- Stack: `compound-engineering`, repository `EveryInc/compound-engineering-plugin`, commit
  `0f7ae5ed909322dbca9c133ca6db1104b6be69f5`, licence MIT (`LICENSE` is a byte copy of the clone's).
- Blocks:

  | Block | Kind | Source path | Lines |
  |---|---|---|---|
  | `learnings-researcher` | agent | `skills/ce-plan/references/agents/learnings-researcher.md` | 268 |

- The import is **partial**: one block of the stack.
- `pending`: none. The text names no other block of the stack. It speaks of "the caller", of
  "CE config" and of `CONCEPTS.md`, `<root>/solutions/` and `critical-patterns.md`, which are
  files of the project the agent runs in (written by `ce-compound` and `ce-setup`), not files of
  the stack. It routes nowhere: it returns to whoever dispatched it.

## 2. Added to the language

Nothing. Terms are added after every stack of this import is marked.

## 3. Left unmapped

All 13 `purpose` passages are on `Memory`: they depend on how this stack keeps its lessons
(markdown files with YAML frontmatter under `<root>/solutions/`, a `problem_type` taxonomy, an
optional `patterns/critical-patterns.md`, and Compound Packs of rule files declared in CE config).
Lines are those of the marked file.

| Block | File:line | Passage | Proposed term | Certain? |
|---|---|---|---|---|
| learnings-researcher | learnings-researcher.md:24-33 | the shapes of learnings (bug-track and knowledge-track) | trait `Memory.classified`: each lesson carries a category from a fixed list | not certain: only this stack seen; may be a `Lesson` field rather than a trait |
| learnings-researcher | :39-48 | search roots: `<root>/solutions/` plus Compound Packs, and the pack rules | concept `RulePack` (a small, prescriptive set of rule files, each with the conditions it applies when), owned by `Memory` or a concept of its own | not certain: unclear whether a pack is memory (lessons) or standards (criteria); other stacks may have it as "rules" or "standards" |
| learnings-researcher | :50-54 | Step 0, ground in `CONCEPTS.md` | concept `Glossary`: the project's canonical names for its domain terms | not certain: written by the same skill that writes lessons, but it is not a lesson; no second stack seen |
| learnings-researcher | :58-60 | the store holds docs with YAML frontmatter; shell fallback | none (provider detail) | — |
| learnings-researcher | :204 | `**Problem Type**` from raw `problem_type` | same as `Memory.classified` | not certain |
| learnings-researcher | :206-215 | Frontmatter Schema Reference | same as `Memory.classified` | not certain |
| learnings-researcher | :229 | `Skipped pack files` output line | same as `RulePack` | not certain |
| learnings-researcher | :231-232 | `Critical Patterns` output section | trait `Memory.pinned`: some lessons apply to all work and are read every time | not certain: one stack, one optional file |
| learnings-researcher | :238 | `**Pack**` output line | `RulePack` | not certain |
| learnings-researcher | :240 | `**Problem Type**` output line | `Memory.classified` | not certain |
| learnings-researcher | :260-269 | Efficiency DO list | none (how to search this store cheaply) | — |
| learnings-researcher | :274-277 | Efficiency DON'T, search items | none | — |
| learnings-researcher | :280-281 | Efficiency DON'T, bug-track fields and critical patterns | `Memory.classified`, `Memory.pinned` | not certain |

## 4. Marks

`learnings-researcher`:

| Mark | Count |
|---|---|
| `fs:uses` with verb | 2 (`Memory.search`: Steps 2 to 5; `Memory.read`: Step 6) |
| `fs:uses` with `purpose` | 13 (all `Memory`) |
| `fs:concept` `Lesson` | 22 ("learning", "learnings", "Learnings") |
| `fs:concept` `Memory` | 13 (`<root>/solutions/`, "the team's knowledge base", "the full learning corpus") |
| `fs:artifact` | 2 (`context`, `learnings`) |
| `fs:ref`, `fs:route`, `fs:part`, `fs:path` | 0 |

Header: `uses: Memory { written-for: compound-engineering, verbs: [search, read], names: [Lesson] }`;
`provides`: none; `references`: none; `inputs: context (request, required)`;
`outputs: learnings (lessons)`; `outcomes: done, no-matches, could-not-run`; `assumes`: a
content-search and file-search tool (Grep/Glob) or a shell with `rg`/`find`, partial file reads;
parallel searches.

## 5. Judgment calls

- `written-for: compound-engineering`, not a block id: lessons are written by `ce-compound` and
  maintained by `ce-compound-refresh`, read by several skills; no single block of the stack
  provides `Memory`.
- Steps 2 to 5 (with their headings, including Step 3b's critical-patterns read) are one `search`
  mark rather than one per step, so that a provider's single sentence replaces the procedure once.
  The cost: "Step 3", "Step 4" in other passages point at text that may be gone; all those
  passages are `purpose` marks the assembler rewrites anyway.
- The Efficiency Guidelines are `purpose`, not `search`: a verb mark per list would repeat the
  provider's search sentence.
- Packs and `CONCEPTS.md` are treated as part of this stack's `Memory` (the same skill writes them
  next to the lessons), so their passages are `Memory` purposes.
- Input `context` is kind `request`: the closest kind for the caller's planning summary or
  `<work-context>` block, though it is the caller's summary, not the person's words. The
  search-root list and the already-cited pack files are not declared as inputs: they are no
  artifact kind; they are inside the Search Roots `purpose` mark.
- Output `learnings` is kind `lessons`, although it is not kept between runs. Its mark has no
  `fs:path`: the text says "write the document there", with no literal place.
- "no-matches" is an outcome of its own because the text describes that ending separately.
- Output-template lines that fall back gracefully (`Module`, `Severity`) are left unmarked;
  `Problem Type`, `Pack`, `Skipped pack files` and `Critical Patterns` are marked.
- Grep, Glob, Bash and Read are harness tools: `assumes`, not references.

## 6. Gaps in the documents

- `docs/format.md`, "Marks": `purpose` needs a `concept`. A passage that relies on something
  no concept fits at all (here `CONCEPTS.md`) cannot be marked `purpose` without picking a host
  concept; I used `Memory` because the same skill writes it.
- `docs/language.md`, artifact kinds: nothing fits "the caller's description of the work" for a
  researcher; `request` is the person's words. Nor is there a kind for a search result that is not
  kept (`lessons` says "kept for later runs").
- `docs/format.md`: silent on whether a block that returns to its caller, rather than routing,
  needs `fs:route` marks for its outcomes, and on an output whose place is given by the caller
  with no literal path in the text (`fs:artifact` without `fs:path`). I used no routes and no
  `fs:path`.
- `docs/format.md`: silent on whether a verb mark may span several headed sections; marks that
  cover a heading leave neighbouring "Step n" cross-references dangling.

## 7. Files left out

- `skills/` — every other skill, agent prompt, reference and script: not picked for this import.
  The same agent has other copies, not imported: `skills/ce-ideate/references/agents/`,
  `skills/ce-optimize/references/agents/`, `skills/ce-code-review/references/personas/`.
- `src/`, `scripts/`, `tests/`, `docs/`, `site/`, `assets/`, the per-harness plugin folders
  (`.claude-plugin/`, `.cursor-plugin/`, …) and the root files: not picked for this import.

## 8. Time

- `learnings-researcher`: about 4 minutes of marking (06:06:17 to 06:10:23 including reading).
- Whole import, with reading the documents and the clone: about 6 minutes.
