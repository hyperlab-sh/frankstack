<fs:block>
id: pstack/correct
source: { repo: cursor/plugins, commit: "2f87c854fe3e2fcda44ca86b46ede35aad3c46b7", path: pstack/skills/correct/SKILL.md }
kind: skill
does: Finds the mistakes agents keep repeating in a repository and changes the repository so each one can no longer be made, choosing architecture, then types and lints, then tests, and docs last.
files:
  SKILL.md: e347045d00c967a0b831ef883cc6ac79d21329aa10b5968637df95de7febf0ba
uses:
  Memory: { written-for: pstack, verbs: [write, search, delete], names: [Lesson] }
outputs:
  change: { kind: change }
  report: { kind: report }
outcomes:
  done: The reply gives each mistake class with its evidence, the level picked and why a higher level did not work.
assumes:
  - The work is in a git repository whose recent commits and reverts can be read.
  - Review comments on past changes can be read.
  - The repository has CI, and a check can be run with the same command locally and in CI.
  - Lints and type checks can be added to the repository's tooling.
  - A human can approve an exception to a check.
</fs:block>
---
name: correct
description: "Find the mistakes agents keep repeating in this repo and make each one impossible. Try architecture first, then types, then a lint whose error names the fix, then a test, and write docs last. Prove each check fails on a real past mistake. Repeat this each time the operator corrects you. Use for /correct."
disable-model-invocation: true
---

# Correct

The operator keeps correcting agents in this repo for the same mistakes. Change the repo so the next agent can't make them.

Assume every contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Design the repo so a change that looks right from one file is right for the whole repo.

## Find the mistake classes

First, read recent commits, reverts, review comments, <fs:concept name="Memory">agent instruction files</fs:concept>, and comments that explain workarounds. Group the mistakes into classes. A class counts once it has happened twice.

## Fix each class at the highest level that works

1. **Eliminate it with architecture.** Give each piece of state one owner and each task one supported way. Hide internals so the wrong import fails. Replace hand-synced lists with one source of truth. Delete old ways and dead code an agent would copy.
2. **Enforce it with types so the bad state can't be written.** If bad code still compiles, add a lint or CI check whose error names the file, type, or function to use instead. If the pattern is already common, fail only when a change adds more.
3. **Test the behavior.** Fix or delete any test that still passes when the behavior it checks breaks, or that fails when only the internals change.
4. **Write docs or <fs:concept name="Lesson">agent rules</fs:concept> last, only for judgment calls.** Nothing fails when an agent skips them.

## Fix and prove

Then fix the most frequent classes now<fs:artifact name="change">, one commit each</fs:artifact>. Prove each new check fails on a real past mistake. Run the same command locally and in CI. Exceptions go on the offending line with a reason, an expiry date, and a human's approval.

## Keep the rule table

<fs:uses concept="Memory" purpose="Keeps every rule beside the check that enforces it, so that a rule nothing enforces can be told apart.">Last, keep a table in <fs:concept name="Memory">the agent instruction file</fs:concept> that pairs each <fs:concept name="Lesson">rule</fs:concept> with what enforces it.</fs:uses> <fs:uses concept="Memory" verb="write">When the operator corrects you, fix the mistake and add the <fs:concept name="Lesson">rule</fs:concept>.</fs:uses> <fs:uses concept="Memory" verb="search">If the <fs:concept name="Lesson">rule</fs:concept> was already there and nothing enforces it, that's a repeat, so fix it at the highest level in the same change.</fs:uses> <fs:uses concept="Memory" verb="delete">Drop a <fs:concept name="Lesson">rule</fs:concept> once its mistake can't happen.</fs:uses>

<fs:artifact name="report">**Reply:** each class with its evidence, the level you picked, and why a higher level didn't work.</fs:artifact>
