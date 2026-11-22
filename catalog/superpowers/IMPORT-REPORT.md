# Import report: superpowers

## 1. What was imported

- Stack: Superpowers. Repository `obra/superpowers`, commit
  `22f0b463e7a5e579904dd6211a520321035526f7`, licence MIT (`LICENSE` is a byte copy).
- The import is **partial**: four blocks were named for it, and only those are here.

| Block | Kind | Source path | Lines |
|---|---|---|---|
| `task-reviewer-prompt` | prompt | `skills/subagent-driven-development/task-reviewer-prompt.md` | 209 |
| `implementer-prompt` | prompt | `skills/subagent-driven-development/implementer-prompt.md` | 154 |
| `builder-check-prompt` | prompt | `skills/brainstorming/builder-check-prompt.md` | 23 |
| `test-driven-development` | skill | `skills/test-driven-development` (`SKILL.md`, `writing-good-tests.md`) | 330 + 198 |

`pending` in `stack.yaml`, and the text that names each:

| Pending block | Path | Named by |
|---|---|---|
| `subagent-driven-development` | `skills/subagent-driven-development` | implementer-prompt and task-reviewer-prompt ("SKILL.md Model Selection"; every status route goes back to it, the controller) |
| `brainstorming` | `skills/brainstorming` | builder-check-prompt (route of `nothing-important-left`; brainstorming is the skill that dispatches it) |
| `task-brief` | `skills/subagent-driven-development/scripts/task-brief` | task-reviewer-prompt (`bash scripts/task-brief PLAN N`) |
| `review-package` | `skills/subagent-driven-development/scripts/review-package` | task-reviewer-prompt (`bash scripts/review-package PLAN_FILE BASE HEAD`) |
| `writing-skills` | `skills/writing-skills` | test-driven-development, `writing-good-tests.md` (`superpowers:writing-skills`) |

## 2. Added to the language

Nothing by the agent that marked this stack: terms are added after every stack of the import is
marked. The lead then added one, the only proposal below called certain:

- `Executor.resume` (trait): an agent that was given work can be sent another message later, and
  still has what it read and did. No block imported here needs it: `implementer-prompt.md:153`
  keeps its `purpose` mark, because the stack's own fix loop has a way round a harness that
  cannot resume. `subagent-driven-development`, still pending, is the block that uses it.

## 3. Left unmapped

Line numbers are in the marked file.

| Block | File:line | Passage | Term I would propose | Certain? |
|---|---|---|---|---|
| implementer-prompt | implementer-prompt.md:38 | `Subagent (general-purpose): description / model / prompt` dispatch form | trait `Executor.model-choice`: the dispatcher chooses the model the other agent runs on | not certain: the passage is mostly the stack's own dispatch syntax; the model part is a clear trait, but I have seen it only here and beside `cross-model-review`, which may already cover it |
| implementer-prompt | implementer-prompt.md:82 | "You Do Not Dispatch Subagents" section | none (it forbids `dispatch`; a negated verb is not a concept) | not certain: it may be better as a rule of the provider of `Executor` (whether a dispatched agent may dispatch in turn), i.e. a trait `Executor.nested` |
| implementer-prompt | implementer-prompt.md:119 | "Report back with status BLOCKED or NEEDS_CONTEXT." | none: this is `Routing.report` for two outcomes in one sentence; see Gaps | n/a, format gap |
| implementer-prompt | implementer-prompt.md:121 | "The controller can ... re-dispatch with a more capable model, or break the task into smaller pieces." | `Executor.model-choice` (as above) | not certain, as above |
| implementer-prompt | implementer-prompt.md:153 | "If the task review finds issues, you will be resumed with the findings." | trait `Executor.resume`: the dispatcher can send another message to an agent it dispatched, which keeps its context | certain: any provider of `Executor` either has it or not, and the stack's own fix loop says "If your harness cannot send another message to a live subagent" |
| implementer-prompt | implementer-prompt.md:157 | "Then reply with the same short status contract as your first report." | none: `Routing.report` with any outcome; see Gaps | n/a, format gap |
| implementer-prompt | implementer-prompt.md:172 | "Then report back with ONLY (under 15 lines ...)" and the list | verb `Executor.reply` (or a meaning of `result`): what the dispatched agent's last message carries back | not certain: `result` is defined from the dispatcher's side ("reads what it reports"); the side that writes the result has no verb |
| implementer-prompt | implementer-prompt.md:174 | "**Status:** DONE \| DONE_WITH_CONCERNS \| BLOCKED \| NEEDS_CONTEXT" | none: `Routing.report` for four outcomes; see Gaps | n/a, format gap |
| task-reviewer-prompt | task-reviewer-prompt.md:44 | dispatch form, as in implementer-prompt | `Executor.model-choice` | not certain, as above |
| task-reviewer-prompt | task-reviewer-prompt.md:88 | "You Do Not Dispatch Subagents" section | as implementer-prompt:82 | not certain |
| task-reviewer-prompt | task-reviewer-prompt.md:173 | "Your final message is the report itself ..." | `Executor.reply`, as above | not certain |
| task-reviewer-prompt | task-reviewer-prompt.md:218 | "**Task quality:** [Approved \| Needs fixes]" | none: `Routing.report` for two outcomes; see Gaps | n/a, format gap |
| task-reviewer-prompt | task-reviewer-prompt.md:224 | "`[MODEL]` — REQUIRED: reviewer model per SKILL.md Model Selection" | `Executor.model-choice` | not certain, as above |

13 passages: 9 under `Executor`, 4 under `Routing`.

## 4. Marks

Counts of opening tags, header excluded.

**builder-check-prompt**: `fs:uses` 1 (Executor dispatch), `fs:concept` 2 (`design`),
`fs:artifact` 2, `fs:path` 1, `fs:route` 1.
- uses: `Executor` (written-for superpowers, verbs dispatch, needs fresh-context); `Harness` (needs subagents)
- references, provides, assumes: none
- inputs `design` (design, required); outputs `questions` (questions); outcomes `questions`, `nothing-important-left`

**implementer-prompt**: `fs:uses` 10 (Executor: 1 dispatch, 5 purpose; TaskStorage: 1 read-task;
Routing: 3 purpose), `fs:concept` 16 (Task 11, TaskId 2, TaskDefinition 2, Criterion 1),
`fs:ref` 4, `fs:name` 5, `fs:route` 6, `fs:artifact` 5, `fs:path` 3.
- references: `superpowers/subagent-driven-development` (skill, required), `superpowers/test-driven-development` (skill, optional)
- uses: `Executor` (superpowers; dispatch; fresh-context), `Harness` (subagents), `TaskStorage` (superpowers; read-task; names Task, TaskId, TaskDefinition), `Requirement` (superpowers; names Criterion), `Routing` (superpowers)
- assumes: a git repository the implementer can commit to; a test suite and its command
- inputs `brief` (requirements, required), `findings` (findings, optional); outputs `change`, `report`; outcomes `done`, `done-with-concerns`, `blocked`, `needs-context`, `questions`

**task-reviewer-prompt**: `fs:uses` 8 (Executor: 1 dispatch, 4 purpose; TaskStorage: 1 read-task;
Requirement: 1 verdict; Routing: 1 purpose), `fs:concept` 15 (Task 12, TaskId 1, TaskDefinition 1,
`change` 1), `fs:ref` 5, `fs:name` 5, `fs:artifact` 11, `fs:path` 3, `fs:route` 0.
- references: `superpowers/subagent-driven-development` (skill, required), `superpowers/test-driven-development` (skill, optional), `superpowers/task-brief` (script, optional), `superpowers/review-package` (script, optional)
- uses: `Executor` (superpowers; dispatch; fresh-context), `Harness` (subagents), `TaskStorage` (superpowers; read-task; names Task, TaskId, TaskDefinition), `Requirement` (superpowers; verdict), `Routing` (superpowers)
- assumes: git, and the change is a range of commits; a human decides plan-mandated findings
- inputs `brief`, `constraints` (optional), `report`, `diff` (change); outputs `verdict`, `findings`; outcomes `approved`, `needs-fixes`

**test-driven-development**: `fs:concept` 2 (Task), `fs:ref` 1, `fs:name` 1, `fs:artifact` 1.
- references: `superpowers/writing-skills` (skill, optional)
- uses: `TaskStorage` (superpowers; names Task)
- assumes: an automated test suite and its command; a human partner to allow an exception
- outputs `report` (report); outcomes `done`

No block has `provides`, `parts` or `fs:part`.

## 5. Judgment calls

- **A dispatched prompt's statuses are routes back to its dispatcher.** "Use BLOCKED if ..." passes
  control back; I marked it `fs:route` with `to` the skill that dispatches the prompt
  (`subagent-driven-development`, which the prompts call "the controller" and "SKILL.md";
  `brainstorming` for the builder check, which the prompt never names). The other reading, no
  route at all, would leave the status sentences unmarked.
- **`Routing` under `uses`.** Passages that report one of several outcomes, or any outcome, cannot
  be an `fs:route` (one outcome each). I marked them `fs:uses concept="Routing"` with `purpose` and
  listed `Routing: { written-for: superpowers }` under `uses`, against the sentence "A block with
  `fs:route` marks ... does not list it under `uses`".
- **Outcomes I named.** `questions` (implementer: "Ask them now", "ask questions"; builder check:
  the ranked list) and `nothing-important-left` (the stack's own phrase). For the reviewer, the
  outcomes are the task-quality verdict `approved` / `needs-fixes`; the spec ✅/❌ is part of the
  `verdict` artifact, not an outcome. `done` of the implementer has no route mark: no sentence
  says "use DONE" alone.
- **"TDD" is a reference to `test-driven-development`.** In both SDD prompts "TDD" and "TDD
  Evidence" (RED/GREEN) mean the stack's skill, not only the practice. Marked optional, covering
  the text that only makes sense with it.
- **The task brief is an input of kind `requirements`**, because SDD says the brief "is your
  requirements". `plan` was the other candidate (it is a piece of the plan). Reading it is also
  `TaskStorage.read-task`; the artifact mark is nested in the `fs:uses`.
- **Global constraints** are a second, optional `requirements` input (`constraints`) with no
  `fs:path`: they are pasted into the prompt, not read from a file.
- **The reviewer's diff** is an input `diff` of kind `change`; "review package" is the stack's word
  for it (`fs:concept name="change"`).
- **Spec-compliance lines are `Requirement.verdict`.** The ✅/❌/⚠️ list is where the reviewer
  records whether the requirements are met. With another `Requirement` provider the assembler
  replaces the whole list, which is what that verb is for; but it also drops the ⚠️ distinction.
- **The implementer's "resumed with the findings"** is a `findings` input (optional), and the
  section around it is marked as only making sense when findings exist.
- **`fs:concept` for the named concepts only.** Every "task" meaning one piece of work is marked
  `Task`, as the format's example does. Words that are just the artifact kind's own name ("plan",
  "spec", "requirements", "report") are not marked; the stack's own phrases for an artifact kind
  ("design document", "written design", "review package") are.
- **`Harness: { needs: [subagents] }`** on the three prompts: "general-purpose subagent" is the
  harness's subagent type. Kept beside `Executor`, which is how the stack hands work over.
- **`writing-good-tests.md`** is a file of the TDD block; the link to it from `SKILL.md` is not a
  reference to another block and has no mark.
- **TDD's "your report"** is an output `report`, so that an assembly without a report can drop the
  sentence.
- **Not marked:** "If BLOCKED or NEEDS_CONTEXT, put the specifics in the final message itself"
  (it still holds under any provider); "Before marking work complete" in TDD (it does not mark
  anything); `npm test` / `pytest` examples (examples of a test command, covered by `assumes`).

## 6. Gaps in the documents

- **`fs:route` has one outcome and a required `to`** (`docs/format.md`, "Marks"). A status line
  that lists several outcomes ("DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT") and a
  sentence that says "end with any of your statuses" have no mark. I used `fs:uses Routing` with
  `purpose`, which contradicts "A block with `fs:route` marks relies on `Routing` and does not list
  it under `uses`" (format, "Header keys"). The checker accepts it.
- **No word for where a dispatched prompt's outcome goes.** The format's routes name the next
  block; a subagent prompt reports back to whoever dispatched it. `to` must be a block, so I named
  the dispatching skill, even where the text does not name it (builder check). The format should
  say whether that is right or whether `to` may be absent for "back to the caller".
- **`fs:route` replaces the condition with it.** "Use BLOCKED if you cannot complete the task" is
  replaced whole by the provider's `report` sentence; the condition survives only in the header's
  `outcomes`. The format does not say the assembler keeps the condition.
- **"The controller" is the stack's word for the lead**, and `Lead` is a term, not a concept, so
  `fs:concept` cannot name it (`docs/language.md`, "Terms").
- **No artifact kind for one task's text.** The task brief is a `TaskDefinition` written to a file;
  `docs/language.md` "Artifact kinds" has `plan` and `requirements`, neither exact.
- **`Executor.result` has no counterpart for the dispatched side.** What the subagent writes as its
  last message (the contract of both SDD prompts) has no verb; marked `purpose`.
- **A pending block inside another pending block's folder.** `task-brief` and `review-package`
  are under `skills/subagent-driven-development/`, the pending path of the SDD skill (as these two
  prompts are). `docs/catalog.md` says `source.path` is "the block's folder", which for SDD will
  hold files of five other blocks; nothing says that is allowed.
- **Same-span nesting** (an `fs:artifact` and an `fs:uses` over the same sentence) is used and is
  not addressed by "Marks nest. Two marks never overlap in part."; the checker accepts it.

## 7. Files left out

All not picked for this import:

- `skills/` — every other skill, and the other files of `skills/subagent-driven-development/`
  (`SKILL.md`, `re-review-prompt.md`, `references/`, `scripts/`) and `skills/brainstorming/`
  (`SKILL.md`, `visual-companion.md`, `scripts/`).
- `hooks/`, `scripts/`, `assets/`, `docs/`, `tests/`.
- Root files: `README.md`, `AGENTS.md`, `GEMINI.md`, `CODE_OF_CONDUCT.md`, `RELEASE-NOTES.md`,
  `package.json`, `gemini-extension.json`, `index.js`. (`LICENSE` is copied.)

## 8. Time

Reading the documents, the checker and the clone (SDD, brainstorming, fix loop): about 5 minutes,
06:06–06:11. Marking, with timestamps from the shell:

| Block | Start | End | Minutes |
|---|---|---|---|
| builder-check-prompt | 06:11:09 | 06:11:44 | 1 |
| implementer-prompt | 06:11:44 | 06:12:40 | 1 |
| task-reviewer-prompt | 06:12:40 | 06:13:26 | 1 |
| test-driven-development | 06:13:26 | 06:13:45 | under 1 |

The whole import, with this report: about 10 minutes. The timestamps understate the marking:
most of the reading of each text happened before 06:11, while planning.
