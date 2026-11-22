# Import report: pstack

## 1. What was imported

- Stack: pstack. Repository: `cursor/plugins`, commit `2f87c854fe3e2fcda44ca86b46ede35aad3c46b7`
  (the commit that set the plugin's version to 0.15.43). pstack is one plugin of that repository,
  in its folder `pstack/`. The other folders of the repository are other plugins and not part of
  this stack.
- Licence: MIT. The licence file is `pstack/LICENSE`; the repository has none at its root.
  `LICENSE` here is a byte copy of `pstack/LICENSE`.
- Blocks:

  | Name | Kind | Source path | Lines |
  |---|---|---|---|
  | `correct` | skill | `pstack/skills/correct/SKILL.md` (the folder holds no other file) | 32 |

- The import is partial: one block of the stack.
- `pending`: none. The text of `correct` names no other block of the stack (no skill, agent,
  automation or doc), and passes control to none. Other blocks name `correct` (`README.md`,
  `skills/poteto-help`, `docs/guide/07`, `08`, `09`, `10`); that does not make anything pending here.

## 2. Added to the language

Nothing. Terms are added after every stack of this import is marked.

## 3. Left unmapped

| Block | File and line | Passage | Term proposed | Certain? |
|---|---|---|---|---|
| `correct` | `SKILL.md`:51 (marked file; line 30 of the original) | "keep a table in the agent instruction file that pairs each rule with what enforces it" | a trait of `Memory`, e.g. `enforced`: each lesson names the check that enforces it, so a lesson nothing enforces can be found | not certain: seen in this one skill only; it may be pstack's own invention, and it is unclear whether it is a trait of the store or a field of `Lesson` |

## 4. Marks

`correct`:

| Mark | Count |
|---|---|
| `fs:uses` with `verb` | 3 (`Memory.write`, `Memory.search`, `Memory.delete`) |
| `fs:uses` with `purpose` | 1 (`Memory`) |
| `fs:concept` | 8 (`Memory` ×2, `Lesson` ×6) |
| `fs:artifact` | 2 (`change`, `report`) |
| `fs:path` | 0 |
| `fs:ref`, `fs:name`, `fs:route`, `fs:part` | 0 |

Header: `uses: Memory { written-for: pstack, verbs: [write, search, delete], names: [Lesson] }`;
`provides`: none; `references`: none; `outputs`: `change` (kind `change`), `report` (kind
`report`); `outcomes`: `done`; `assumes`: a readable git history (commits, reverts); readable
review comments; CI that runs the same command as a local run; lints and type checks can be
added; a human can approve an exception.

## 5. Judgment calls

- **The rule table is `Memory`.** The table of rules in the repository's agent instruction file is
  where lessons from earlier corrections are kept for later runs, which is `Memory`. The other
  reading: it is just a file of the repository the skill changes, like any other. I took `Memory`,
  with `written-for: pstack`, because pstack has no block that provides it (its `recall` and
  `reflect` skills deal with transcripts and skills, not this table).
- **"agent rules" in item 4 is `Lesson`.** Item 4 ("Write docs or agent rules last") is a fix
  level, a change to the repository, not a use of the store. I marked only the words with
  `fs:concept Lesson` and did not mark the item with a verb, so the ranking survives any provider.
- **"agent instruction files" in the first step** is marked `fs:concept Memory` and not a verb:
  it is one source among commits and review comments, read for evidence of mistakes.
- **Whole sentences under a verb.** "When the operator corrects you, fix the mistake and add the
  rule." also holds "fix the mistake", and "Drop a rule once its mistake can't happen." holds a
  condition. Under another `Memory` provider the sentence is replaced whole and those parts go.
  `docs/format.md` asks verb marks to cover whole sentences, so I followed it.
- **`change` covers only ", one commit each".** An output a cell does not give has its passage
  taken out; marking the whole sentence would delete the instruction to fix the classes. The
  smallest passage that can go and leave correct text is ", one commit each".
- **No input.** The operator's correction (an argument to `/correct`, per the guide) is not named
  as an input in the skill's text; history is read from the repository, listed under `assumes`.
- **Exceptions on the offending line** ("with a reason, an expiry date, and a human's approval")
  are left unmarked: a code convention, not a reliance on `Decisions` or another concept.
- **Frontmatter** is not marked ("Repeat this each time the operator corrects you", "Use for
  /correct"): the assembler writes frontmatter per target, and "/correct" names the block itself.
- **One outcome, `done`.** The text describes one ending, the reply.

## 6. Gaps in the documents

- `docs/format.md`, "What the assembler does at a mark": an output that no cell gives has its
  `fs:artifact` passage taken out ("optional only"). Outputs are always optional for a cell, so a
  marked output sentence can be deleted. The docs do not say whether that rule is meant for
  outputs; I marked the smallest passage that can go.
- `docs/format.md`, "How marks are placed": `fs:uses` covers whole sentences, yet the smallest
  replaceable passage may be part of a sentence that also does something else. Nothing says which
  wins; I took whole sentences.
- `docs/format.md`: `fs:artifact` without `fs:path` (an output with no place, like a commit or a
  reply in chat) is accepted by the checker and not described in the documents.
- `docs/language.md`: whether an agent instruction file of the repository (AGENTS.md, CLAUDE.md)
  is `Memory` or part of the repository the work changes is not said. It matters to many skills.

## 7. Files left out

All not picked for this import:

- `pstack/skills/` other than `correct/` (about 70 skills, principles included).
- `pstack/agents/`, `pstack/automations/`, `pstack/docs/`, `pstack/assets/`.
- `pstack/README.md`, `pstack/plugin.json`, `pstack/.cursor-plugin/`, `pstack/.gitignore`.
- Every folder of `cursor/plugins` outside `pstack/`: other plugins, not part of this stack.

## 8. Time

- `correct`: about 1 minute of marking (06:08:28 to 06:09:01), after 2 minutes reading the
  documents and the clone.
- Whole import, reading and report included: about 3 minutes (06:06:35 to 06:09:29).
