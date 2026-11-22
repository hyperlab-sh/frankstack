# Import report: lavra (partial)

## 1. What was imported

- Stack: Lavra, repository `roberto-mello/lavra`, commit `2e7e512eb90baee2c45fa4e08e685d0328fe58db`,
  licence MIT (`LICENSE` is a byte copy of the repository's `LICENSE`).
- The import is partial: one block.

| Block | Kind | Source path | Lines |
|---|---|---|---|
| `lavra/goal-verifier` | agent | `plugins/lavra/agents/review/goal-verifier.md` | 110 |

- `pending`: none. The text names no other block of the stack. It is dispatched by
  `skills/lavra-work-single`, `skills/lavra-work-multi` and `commands/lavra-ship`, but a block that
  dispatches it is not a block it references, so none of them is listed.

## 2. Added to the language

Nothing. Terms are added after every stack of this import is marked.

## 3. Left unmapped

No passage is marked with `purpose`. Every reliance on a concept in this text is a name (`Task`,
`TaskId`, `TaskDefinition`, `Criterion`); nothing in it depends on how `bd` works.

| Block | File:line | Passage | Proposed term | Certain |
|---|---|---|---|---|
| (none) | | | | |

## 4. Marks

`lavra/goal-verifier` (`goal-verifier.md`):

| Mark | Count |
|---|---|
| `fs:block` | 1 |
| `fs:concept` | 19 (Criterion 11, Task 4, TaskId 2, TaskDefinition 2) |
| `fs:artifact` | 7 (criteria 1, what 1, change 3, verification 2) |
| `fs:uses`, `fs:ref`, `fs:route`, `fs:part`, `fs:name`, `fs:path` | 0 |

Header:

- `uses`: `TaskStorage` (written-for `lavra`, names `Task`, `TaskId`, `TaskDefinition`, no verbs);
  `Requirement` (written-for `lavra`, names `Criterion`, no verbs).
- `provides`: none. `references`: none.
- `inputs`: `criteria` (requirements, required), `what` (plan, required), `change` (change, required).
- `outputs`: `verification` (verdict).
- `outcomes`: `pass`, `fail` (the text's own "Verdict: PASS / FAIL").
- `assumes`: the agent can search and read the codebase (the text names the harness's Glob, Grep
  and Read tools).

## 5. Judgment calls

- `written-for: lavra`, not `lavra/beads`. Lavra has no block of its own for tasks: it drives the
  external `bd` CLI from the text of its skills, commands and hooks. `docs/format.md` uses
  `lavra/beads` as an example id, but no such block exists in the repository.
- The bead's `## Validation` section is `Criterion` (owned by `Requirement`), as in the marks
  table of `docs/format.md`; the `## What` section is `TaskDefinition`. So the block uses two
  concepts, both written for `lavra`. The format's own `provides` example lists `Criterion`
  under `TaskStorage.names`, which the checker rejects (`Criterion` is named by `Requirement`); I
  followed the checker and `docs/language.md`.
- No verbs. The agent receives the sections in its prompt; it does not `read-task` from storage
  and does not record a `verdict` in the provider (it writes its verdict into its report). A
  verb mark would also replace table rows and headings with a provider sentence.
- Plain "criterion"/"criteria"/"success criteria" are marked `Criterion` wherever they mean the
  task's criteria, including headings and table headers, so a provider's word can replace them.
  "acceptance criteria" in parentheses after the Validation section is left inside that mark's
  artifact but outside the concept mark: it explains the section and would read oddly replaced.
- Marks are put in the frontmatter `description` too. The assembler rewrites frontmatter by the
  target, but the marks tell it what "bead" and "success criteria" mean there.
- Input kinds: Validation is `requirements` (each item has a check); What is `plan` (one task's
  share of the plan); the codebase and "all changed files" are `change`. The report is
  `verdict`, though it also carries findings (anti-pattern table); one output was chosen, not two.
- Outcomes `pass` / `fail` come from the verdict line; there is no `fs:route` because the agent
  passes control to nobody. "Any CRITICAL failure means the bead is NOT ready to ship" is marked
  only for `Task`.
- "other agents handle that" (code quality) names no block: not a reference, not marked.
- `model: sonnet`, `color: green` are Claude Code frontmatter for the target; not in `assumes`.
- The example's `BD-001` and the template's `{BEAD_ID}` are `TaskId`.

## 6. Gaps in the documents

- `docs/format.md`, header example under "A block that provides a concept": `Criterion` is given
  under `TaskStorage.names`, but `docs/language.md` says the provider of `Requirement` names it,
  and the checker reports that as `unknown-term`. One of them should change.
- `docs/format.md` has no rule for marks inside frontmatter, while the assembler "writes the
  frontmatter as the target's file says". Unclear whether a mark there is wanted or ignored.
- No guidance on choosing one artifact kind for an output that is both `findings` and `verdict`,
  nor on which kind an input that is one task's definition gets (`plan`? `requirements`?).
- `written-for` is not checked against anything, so `lavra` vs. a block id is a convention only.
- No rule says whether a section name used alone ("the Validation and What sections") is a
  stack's word for the concept or just a heading.

## 7. Files left out

All other files of the repository, not picked for this import: `plugins/lavra/agents/` (the
other agents), `plugins/lavra/skills/`, `plugins/lavra/commands/`, `plugins/lavra/hooks/`,
`plugins/lavra/scripts/`, the platform sources (`opencode-src/`, `gemini-src/`), `installers/`,
`bin/`, `scripts/`, `site/`, `images/`, and the root files.

## 8. Time

- `goal-verifier`: about 3 minutes by the clock (06:06:26 to 06:09:03), reading the documents
  and the dispatching skills included.
- Whole import: about 3 minutes.
