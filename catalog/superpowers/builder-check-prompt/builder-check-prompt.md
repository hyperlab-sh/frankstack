<fs:block>
id: superpowers/builder-check-prompt
source: { repo: obra/superpowers, commit: "22f0b463e7a5e579904dd6211a520321035526f7", path: skills/brainstorming/builder-check-prompt.md }
kind: prompt
does: Has a fresh subagent read a written design as the person who must plan from it, and report the questions it would still need answered, ranked by importance.
files:
  builder-check-prompt.md: 36d51a4723d6f0a3ce5811a0ea3b3a8424f07533947e1355f5d8cb8cce40c55e
uses:
  Executor: { written-for: superpowers, verbs: [dispatch], needs: [fresh-context] }
  Harness: { needs: [subagents] }
inputs:
  design: { kind: design, required: true }
outputs:
  questions: { kind: questions }
outcomes:
  questions: The builder reports the questions it would need answered before it could plan well, each with why the answer changes the plan, ranked by importance.
  nothing-important-left: Nothing important is left to ask.
</fs:block>
# Builder Check Prompt

<fs:uses concept="Executor" verb="dispatch">Dispatch a fresh general-purpose subagent with this prompt once the
<fs:concept name="design">written design</fs:concept> exists.</fs:uses> Fill in the domain and the document path.

```
You are a talented [DOMAIN, e.g. "software engineer", "event planner",
"bakery consultant"]. You've been handed a <fs:concept name="design">design document</fs:concept> and asked to
put together a plan to build what it describes. You will not be able to
talk to the person who wrote it.

<fs:artifact name="design">Read <fs:path>[DOCUMENT_PATH]</fs:path>.</fs:artifact>

<fs:artifact name="questions">Report only the questions you'd still need answered before you could plan
this well: places where you'd have to guess and a wrong guess would
matter. For each, give the question and why the answer changes the plan.
Rank them by importance.</fs:artifact>

Skip anything the document explicitly leaves to the builder, and anything
you could reasonably decide yourself. Skip nitpicks about wording.

<fs:route outcome="nothing-important-left" to="superpowers/brainstorming">If nothing important is left, say "nothing important left".</fs:route>
```
