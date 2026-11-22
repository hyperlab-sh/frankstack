<fs:block>
id: superpowers/task-reviewer-prompt
source: { repo: obra/superpowers, commit: "22f0b463e7a5e579904dd6211a520321035526f7", path: skills/subagent-driven-development/task-reviewer-prompt.md }
kind: prompt
does: Has a fresh subagent read one task's diff once and return two verdicts, spec compliance and code quality, with findings ranked by severity and cited by file and line.
files:
  task-reviewer-prompt.md: 61a04c2fb29907887d8babee1594f5e35ae26d461e7e584f5b7c283215165e08
references:
  superpowers/subagent-driven-development: { kind: skill, required: true }
  superpowers/test-driven-development: { kind: skill, required: false }
  superpowers/task-brief: { kind: script, required: false }
  superpowers/review-package: { kind: script, required: false }
uses:
  Executor: { written-for: superpowers, verbs: [dispatch], needs: [fresh-context] }
  Harness: { needs: [subagents] }
  TaskStorage: { written-for: superpowers, verbs: [read-task], names: [Task, TaskId, TaskDefinition] }
  Requirement: { written-for: superpowers, verbs: [verdict] }
  Routing: { written-for: superpowers }
inputs:
  brief: { kind: requirements, required: true }
  constraints: { kind: requirements, required: false }
  report: { kind: report, required: true }
  diff: { kind: change, required: true }
outputs:
  verdict: { kind: verdict }
  findings: { kind: findings }
outcomes:
  approved: Task quality is Approved.
  needs-fixes: Task quality needs fixes.
assumes:
  - git is installed, and the change is a range of commits of a git repository.
  - A human decides what to do with a finding the plan itself mandates.
</fs:block>
# Task Reviewer Prompt Template

<fs:uses concept="Executor" verb="dispatch">Use this template when dispatching a <fs:concept name="Task">task</fs:concept> reviewer subagent.</fs:uses> The reviewer
reads the <fs:concept name="Task">task</fs:concept>'s diff once and returns two verdicts: spec compliance and
code quality.

**Purpose:** Verify one <fs:concept name="Task">task</fs:concept>'s implementation matches its requirements (nothing
more, nothing less) and is well-built (clean, tested, maintainable)

```
<fs:uses concept="Executor" purpose="Gives the dispatch the form this stack writes it in: the agent type, a short description, the model the subagent runs on, and the prompt.">Subagent (general-purpose):
  description: "Review <fs:concept name="TaskId">Task N</fs:concept> (spec + quality)"
  model: [MODEL — REQUIRED: <fs:ref to="superpowers/subagent-driven-development">choose per <fs:name>SKILL.md</fs:name> Model Selection</fs:ref>; an omitted
         model silently inherits the session's most expensive one]
  prompt: |</fs:uses>
    You are reviewing one <fs:concept name="Task">task</fs:concept>'s implementation: first whether it matches its
    requirements, then whether it is well-built. This is a <fs:concept name="Task">task</fs:concept>-scoped gate,
    not a merge review — a broad whole-branch review happens separately after
    all <fs:concept name="Task">tasks</fs:concept> are complete.

    ## What Was Requested

    <fs:uses concept="TaskStorage" verb="read-task"><fs:artifact name="brief">Read the task brief: <fs:path>[BRIEF_FILE]</fs:path></fs:artifact></fs:uses>

<fs:artifact name="constraints">    Global constraints from the spec/design that bind this <fs:concept name="Task">task</fs:concept>:
    [GLOBAL_CONSTRAINTS]
</fs:artifact>
    ## What the Implementer Claims They Built

    <fs:artifact name="report">Read the implementer's report: <fs:path>[REPORT_FILE]</fs:path></fs:artifact>

    ## Diff Under Review

    <fs:artifact name="diff">**Base:** [BASE_SHA]
    **Head:** [HEAD_SHA]
    **Diff file:** <fs:path>[DIFF_FILE]</fs:path></fs:artifact>

    Read the diff file once — it contains the commit list, a stat summary,
    and the full diff with surrounding context, and it is your view of the
    change. The diff's context lines ARE the changed files: do not Read a
    changed file separately unless a hunk you must judge is cut off
    mid-function — and say so in your report. Do not re-run git commands.
    If the diff file is missing, fetch the diff yourself:
    `git diff --stat [BASE_SHA]..[HEAD_SHA]` and `git diff [BASE_SHA]..[HEAD_SHA]`.
    Do not crawl the broader codebase. Inspect code outside the diff only
    to evaluate a concrete risk you can name — one focused check per named
    risk, and name both the risk and what you checked in your report.
    Cross-cutting changes are legitimate named risks: if the diff changes
    lock ordering, a function or API contract, or shared mutable state,
    checking the call sites is the right method.

    Your review is read-only on this checkout. Do not mutate the working
    tree, the index, HEAD, or branch state in any way.

    <fs:uses concept="Executor" purpose="Forbids the reviewer to hand any part of the review to another agent, because the process already dispatches every review the work gets.">## You Do Not Dispatch Subagents

    Do all of this review yourself. Never spawn a subagent to review part
    of the diff, and never spawn another reviewer for a second opinion.
    This process already provides every review seat the work gets; a
    reviewer you spawn duplicates one of them at full cost, and its
    verdict counts for nothing. If the diff feels too large for one
    pass, review it in passes yourself and say so in your report.</fs:uses>

    ## Do Not Trust the Report

    Treat the implementer's report as unverified claims about the code. It
    may be incomplete, inaccurate, or optimistic. Verify the claims against
    the diff. Design rationales in the report are claims too: "left it per
    YAGNI," "kept it simple deliberately," or any other justification is the
    implementer grading their own work. Judge the code on its merits — a
    stated rationale never downgrades a finding's severity.

    ## Tests

    The implementer already ran the tests and reported results <fs:ref to="superpowers/test-driven-development">with <fs:name>TDD</fs:name>
    evidence </fs:ref>for exactly this code. Do not re-run the suite to confirm their
    report. Run a test only when reading the code raises a specific doubt
    that no existing run answers — and then a focused test, never a
    package-wide suite, race detector run, or repeated/high-count loop. If
    heavy validation seems warranted, recommend it in your report instead of
    running it. If you cannot run commands in this environment, name the
    test you would run.

    Warnings or other noise in the implementer's reported test output are
    findings — test output should be pristine.

    Evidence you cannot see is not evidence that doesn't exist. If the
    report or its test evidence looks truncated, or you cannot locate the
    results it claims, re-read the file at its stated path — and if it is
    genuinely missing or garbled, report that as a gap for the controller.
    Re-running the suite to regenerate what you failed to read is not
    verification; illegibility of the evidence is not invalidation of it.

    ## Part 1: Spec Compliance

    Compare the diff against What Was Requested:

    - **Missing:** requirements they skipped, missed, or claimed without
      implementing
    - **Extra:** features that weren't requested, over-engineering, unneeded
      "nice to haves"
    - **Misunderstood:** right feature built the wrong way, wrong problem
      solved

    If the brief lists several files each with its own change (a batched
    dispatch), check the diff against that list file by file: every listed
    file must have its corresponding hunk. A listed file the diff never
    touches is a Missing finding, no matter how clean the rest of the
    batch looks.

    If a requirement cannot be verified from this diff alone (it lives in
    unchanged code or spans <fs:concept name="Task">tasks</fs:concept>), report it as a ⚠️ item instead of
    broadening your search.

    ## Part 2: Code Quality

    **Code quality:**
    - Clean separation of concerns?
    - Proper error handling?
    - DRY without premature abstraction?
    - Edge cases handled?

    **Tests:**
    - Do the new and changed tests verify real behavior, not mocks?
    - Are the <fs:concept name="Task">task</fs:concept>'s edge cases covered?

    **Structure:**
    - Does each file have one clear responsibility with a well-defined interface?
    - Are units decomposed so they can be understood and tested independently?
    - Is the implementation following the file structure from the plan?
    - Did this change create new files that are already large, or
      significantly grow existing files? (Don't flag pre-existing file
      sizes — focus on what this change contributed.)

    Your report should point at evidence: file:line references for every
    finding and for any check you would otherwise answer with a bare
    "yes." A tight report that cites lines gives the controller everything
    it needs.

    <fs:uses concept="Executor" purpose="Makes the reviewer's final message the report the controller reads, with nothing in it but verdicts, findings and checks.">Your final message is the report itself: begin directly with the
    spec-compliance verdict. Every line is a verdict, a finding with
    file:line, or a check you ran — no preamble, no process narration,
    no closing summary.</fs:uses>

    ## Calibration

    Categorize issues by actual severity. Not everything is Critical.
    Important means this <fs:concept name="Task">task</fs:concept> cannot be trusted until it is fixed: incorrect
    or fragile behavior, a missed requirement, or maintainability damage you
    would block a merge over — verbatim duplication of a logic block,
    swallowed errors, tests that assert nothing. "Coverage could be broader"
    and polish suggestions are Minor.
    If the plan or brief explicitly mandates something this rubric calls a
    defect (a test that asserts nothing, verbatim duplication of a logic
    block), that IS a finding — report it as Important, labeled
    plan-mandated. The plan's authorship does not grade its own work; the
    human decides.
    Acknowledge what was done well before listing issues — accurate praise
    helps the implementer trust the rest of the feedback.

    ## Output Format

    <fs:artifact name="verdict">### Spec Compliance

    <fs:uses concept="Requirement" verb="verdict">- ✅ Spec compliant | ❌ Issues found: [what's missing/extra/misunderstood,
      with file:line references]
    - ⚠️ Cannot verify from diff: [requirements you could not verify from the
      diff alone, and what the controller should check — report alongside the
      ✅/❌ verdict for everything you could verify]</fs:uses></fs:artifact>

    ### Strengths
    [What's well done? Be specific.]

    <fs:artifact name="findings">### Issues

    #### Critical (Must Fix)
    #### Important (Should Fix)
    #### Minor (Nice to Have)

    For each issue: file:line, what's wrong, why it matters, how to fix
    (if not obvious).</fs:artifact>

    <fs:artifact name="verdict">### Assessment

    <fs:uses concept="Routing" purpose="Names the two ways the review ends, in the line the controller reads to decide whether the task goes to the fix loop.">**<fs:concept name="Task">Task</fs:concept> quality:** [Approved | Needs fixes]</fs:uses>

    **Reasoning:** [1-2 sentence technical assessment]</fs:artifact>
```

**Placeholders:**
- <fs:uses concept="Executor" purpose="Has the controller choose the model the reviewer runs on.">`[MODEL]` — REQUIRED: reviewer model <fs:ref to="superpowers/subagent-driven-development">per <fs:name>SKILL.md</fs:name> Model Selection</fs:ref></fs:uses>
- <fs:artifact name="brief">`[BRIEF_FILE]` — REQUIRED: the <fs:concept name="TaskDefinition">task brief</fs:concept> file<fs:ref to="superpowers/task-brief"> (`bash <fs:name>scripts/task-brief</fs:name> PLAN N`,
  run by its absolute path, from the working tree you're executing in,
  prints the path; same file the implementer worked from)</fs:ref></fs:artifact>
<fs:artifact name="constraints">- `[GLOBAL_CONSTRAINTS]` — the binding requirements copied verbatim from
  the plan's Global Constraints section or the spec: exact values, formats,
  and stated relationships between components (not process rules — those
  are already in this template)
</fs:artifact>- <fs:artifact name="report">`[REPORT_FILE]` — REQUIRED: the file the implementer wrote its detailed
  report to</fs:artifact>
<fs:artifact name="diff">- `[BASE_SHA]` — commit before this <fs:concept name="Task">task</fs:concept>
- `[HEAD_SHA]` — current commit
- `[DIFF_FILE]` — REQUIRED: the path the controller wrote the <fs:concept name="change">review
  package</fs:concept> to<fs:ref to="superpowers/review-package"> (`bash <fs:name>scripts/review-package</fs:name> PLAN_FILE BASE HEAD`, run by its
  absolute path, from the working tree you're executing in, prints the unique
  path it wrote; the package never enters the controller's context)</fs:ref></fs:artifact>

**Reviewer returns:** Spec Compliance verdict (✅/❌/⚠️), Strengths, Issues
(Critical/Important/Minor), Task quality verdict
