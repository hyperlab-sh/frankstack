import { describe, expect, test } from "bun:test";
import { analyze } from "../src/analyze.ts";
import { loadStack } from "../src/load.ts";
import type { Annotation, CapabilityLevel, Finding } from "../src/types.ts";

/** A sound one-level stack: plan, build, review with a bounded fix loop, learn. */
const BASE = `
name: base
start: plan
ends: [done, escalated]
inputs: [request]
artifacts:
  learnings: { scope: cross-run }
components:
  TaskStorage: components/TaskStorage/tasks-md.md
blocks:
  a/plan: { kind: skill, as: plan, role: router }
  b/build: { kind: skill, as: build }
  c/review: { kind: agent, as: review }
steps:
  plan:
    block: a/plan
    reads: [request, { artifact: learnings, optional: true }]
    writes: [tasks]
    outcomes: { done: build }
  build:
    block: b/build
    reads: [tasks, { artifact: findings, optional: true }]
    writes: [code]
    claims: [task]
    needs: [TaskStorage.claim]
    outcomes: { done: review }
  review:
    block: c/review
    reads: [code]
    writes: [findings]
    outcomes:
      pass: { to: learn, releases: [task] }
      fail: { to: build, max: 3, then: abandon }
  abandon:
    reads: [findings]
    releases: [task]
    outcomes: { done: escalated }
  learn:
    reads: [findings]
    writes: [learnings]
    outcomes: { done: done }
`;

/** A sound two-level stack: an epic cut into tasks, each task built and reviewed. */
const LEVELED = `
name: leveled
levels: [epic, task]
start: define
ends: [done, escalated]
inputs: [request]
steps:
  define:
    reads: [define]
    outcomes: { done: build }
    at:
      epic: { reads: [request], writes: [define], outcomes: { done: decompose } }
      task: { claims: [task], outcomes: { done: build, rejected: escalated } }
  decompose:
    only: [epic]
    reads: [define]
    writes: [children, "child:define"]
    outcomes: { done: build }
  build:
    reads: [children]
    writes: [result]
    children:
      done: verify
      escalated: { to: decompose, max: 2, then: escalated, releases: ["child:task"] }
    at:
      task: { reads: [define], outcomes: { done: verify } }
  verify:
    reads: [result]
    writes: [verdict]
    outcomes:
      pass: done
      fail: { to: build, max: 2, then: escalated }
    at:
      task:
        outcomes:
          pass: { to: done, releases: [task] }
          fail: { to: build, max: 2, then: escalated }
`;

/** What the cards of the fixture stacks declare. */
const CARDS = new Map([
	[
		"components/TaskStorage/tasks-md.md",
		new Map<string, CapabilityLevel>([
			["claim", "native"],
			["ready-queue", "emulated"],
			["sync", "missing"],
		]),
	],
]);
const check = (yaml: string, annotations?: Map<string, Annotation>): Finding[] => {
	const { flat, findings } = loadStack(yaml, CARDS);
	return flat ? [...findings, ...analyze(flat, annotations)] : findings;
};
const errors = (yaml: string, annotations?: Map<string, Annotation>) =>
	check(yaml, annotations).filter((finding) => finding.severity === "error");
const rules = (findings: Finding[]) => findings.map((finding) => finding.rule);
const one = (findings: Finding[], rule: string) => {
	const hits = findings.filter((finding) => finding.rule === rule);
	expect(hits).toHaveLength(1);
	return hits[0] as Finding;
};
/** Replaces exactly one occurrence, so a typo in a test cannot pass silently. */
const swap = (yaml: string, from: string, to: string) => {
	expect(yaml.split(from)).toHaveLength(2);
	return yaml.replace(from, to);
};
const annotation = (
	block: string,
	outcomes: string[],
	extra: Partial<Annotation> = {},
): Annotation => ({
	block,
	files: [],
	outcomes,
	parts: new Map(),
	touches: [],
	mentions: [],
	needs: [],
	...extra,
});

describe("sound stacks", () => {
	test("the one-level stack has no errors", () => {
		expect(errors(BASE)).toEqual([]);
	});
	test("the two-level stack has no errors", () => {
		expect(errors(LEVELED)).toEqual([]);
	});
	test("an emulated capability is a warning, not an error", () => {
		const findings = check(
			swap(BASE, "needs: [TaskStorage.claim]", "needs: [TaskStorage.ready-queue]"),
		);
		expect(one(findings, "emulated-capability").severity).toBe("warning");
		expect(findings.filter((f) => f.severity === "error")).toEqual([]);
	});
});

describe("reads", () => {
	test("a write on one branch only is caught, with the branch that skips it", () => {
		const yaml = swap(
			swap(BASE, "outcomes: { done: build }", "outcomes: { subagents: build, inline: quick }"),
			"  abandon:",
			"  quick:\n    writes: [code]\n    outcomes: { done: review }\n  abandon:",
		);
		// `quick` never claims a task and never reads `tasks`; review passes on to learn either way.
		const yaml2 = swap(
			yaml,
			"  learn:\n    reads: [findings]",
			"  learn:\n    reads: [findings, ledger]",
		);
		const withLedger = swap(
			yaml2,
			"writes: [code]\n    claims",
			"writes: [code, ledger]\n    claims",
		);
		const finding = one(errors(withLedger), "read-before-write");
		expect(finding.message).toContain("`ledger`");
		expect(finding.trace).toEqual([
			"plan -(inline)-> quick",
			"quick -(done)-> review",
			"review -(pass)-> learn",
		]);
	});
	test("a required read of a store kept between runs fails on the first run", () => {
		const finding = one(
			errors(swap(BASE, "{ artifact: learnings, optional: true }", "learnings")),
			"first-run-read",
		);
		expect(finding.message).toContain("plan reads `learnings`");
		expect(finding.trace).toEqual([]);
	});
	test("a block moved in front of the step that feeds it is caught", () => {
		const finding = one(
			errors(swap(BASE, "{ artifact: findings, optional: true }", "findings")),
			"read-before-write",
		);
		expect(finding.trace).toEqual(["plan -(done)-> build"]);
	});
	test("an artifact nobody writes is reported as such", () => {
		expect(
			one(errors(swap(BASE, "reads: [code]", "reads: [code, diff]")), "no-writer").message,
		).toContain("`diff`");
	});
	test("an input the user provides needs no writer", () => {
		expect(rules(errors(BASE))).not.toContain("no-writer");
	});
	test("an artifact nobody reads is a warning", () => {
		const findings = check(swap(BASE, "writes: [tasks]", "writes: [tasks, notes]"));
		expect(one(findings, "never-read").message).toContain("`notes`");
	});
});

describe("loops", () => {
	test("a loop without a bound is caught", () => {
		const finding = one(
			errors(swap(BASE, "fail: { to: build, max: 3, then: abandon }", "fail: build")),
			"unbounded-cycle",
		);
		expect([...(finding.trace ?? [])].sort()).toEqual([
			"build -(done)-> review",
			"review -(fail)-> build",
		]);
	});
	test("a bound that leads back into the loop when used up is caught", () => {
		expect(rules(errors(swap(BASE, "then: abandon }", "then: build }")))).toContain(
			"unbounded-cycle",
		);
	});
	test("a bound with nowhere to go when used up is caught", () => {
		expect(rules(errors(swap(BASE, "max: 3, then: abandon }", "max: 3 }")))).toContain(
			"bound-without-route",
		);
	});
	test("two bounded loops that reset each other are caught", () => {
		const yaml = swap(
			swap(
				BASE,
				"outcomes: { done: review }",
				"outcomes:\n      done: review\n      stuck: { to: plan, max: 2, then: abandon, resets: [review.fail] }",
			),
			"fail: { to: build, max: 3, then: abandon }",
			"fail: { to: build, max: 3, then: abandon, resets: [build.stuck] }",
		);
		const finding = one(
			errors(
				swap(
					yaml,
					"reads: [findings]\n    releases",
					"reads: [{ artifact: findings, optional: true }]\n    releases",
				),
			),
			"bounds-reset",
		);
		expect(finding.message).toContain(
			"build.stuck is bounded, but review.fail sets its count back",
		);
	});
	test("two bounded loops that do not reset each other are fine", () => {
		const yaml = swap(
			BASE,
			"outcomes: { done: review }",
			"outcomes:\n      done: review\n      stuck: { to: plan, max: 2, then: abandon }",
		);
		expect(
			errors(
				swap(
					yaml,
					"reads: [findings]\n    releases",
					"reads: [{ artifact: findings, optional: true }]\n    releases",
				),
			),
		).toEqual([]);
	});
	test("`resets` must name a bounded outcome", () => {
		expect(
			rules(errors(swap(BASE, "releases: [task] }", "releases: [task], resets: [build.done] }"))),
		).toContain("invalid");
	});
});

describe("claims", () => {
	test("an exit that keeps a claim is caught, with the path", () => {
		const finding = one(errors(swap(BASE, "then: abandon }", "then: escalated }")), "leaked-claim");
		expect(finding.trace).toEqual([
			"plan -(done)-> build",
			"build -(done)-> review",
			"review -(fail)-> escalated",
		]);
	});
	test("a claim released by the step itself is not leaked", () => {
		expect(rules(errors(BASE))).not.toContain("leaked-claim");
	});
});

describe("graph shape", () => {
	test("a step with no outcome is a dead end", () => {
		expect(
			one(errors(swap(BASE, "    outcomes: { done: done }", "")), "dead-end").message,
		).toContain("learn");
	});
	test("a step nothing routes to is unreachable", () => {
		const yaml = `${BASE}  orphan:\n    outcomes: { done: done }\n`;
		expect(one(errors(yaml), "unreachable-step").message).toContain("orphan");
	});
	test("a step that can only loop never reaches an end", () => {
		const yaml = swap(
			BASE,
			"    releases: [task]\n    outcomes: { done: escalated }",
			"    releases: [task]\n    outcomes: { again: { to: abandon, max: 1, then: abandon } }",
		);
		expect(rules(errors(yaml))).toContain("end-unreachable");
	});
	test("a route to a name that is no step and no end is invalid", () => {
		expect(
			rules(errors(swap(BASE, "outcomes: { done: build }", "outcomes: { done: biuld }"))),
		).toEqual(["invalid"]);
	});
	test("an unknown key is invalid", () => {
		expect(rules(errors(swap(BASE, "    claims: [task]", "    claim: [task]")))).toEqual([
			"invalid",
		]);
	});
});

describe("whole-stack rules", () => {
	test("two routers", () => {
		expect(rules(errors(swap(BASE, "as: build }", "as: build, role: router }")))).toContain(
			"two-routers",
		);
	});
	test("two blocks installed under one name", () => {
		expect(one(errors(swap(BASE, "as: review }", "as: build }")), "name-clash").message).toContain(
			"b/build and c/review",
		);
	});
	test("two hooks on one event, and only then", () => {
		const hooks = (second: string) =>
			swap(
				BASE,
				"  c/review:",
				`  h/one: { kind: hook, as: one, event: SessionStart }\n  h/two: { kind: hook, as: two, event: ${second} }\n  c/review:`,
			);
		expect(rules(errors(hooks("SessionStart")))).toContain("hook-clash");
		expect(errors(hooks("Stop"))).toEqual([]);
	});
	test("a capability the component the stack uses lacks", () => {
		expect(
			one(
				errors(swap(BASE, "needs: [TaskStorage.claim]", "needs: [TaskStorage.sync]")),
				"missing-capability",
			).message,
		).toContain("cannot provide");
	});
	test("a component is the path of its card, of the type it is listed under", () => {
		const component = (value: string) =>
			errors(
				swap(BASE, "TaskStorage: components/TaskStorage/tasks-md.md", `TaskStorage: ${value}`),
			);
		expect(one(component("tasks-md"), "invalid").message).toContain(
			"components/TaskStorage/<name>.md",
		);
		expect(rules(component("components/Memory/tasks-md.md"))).toContain("invalid");
		expect(one(component("components/TaskStorage/gone.md"), "invalid").message).toContain(
			"is not in the bundle",
		);
	});
	test("a capability of a component the stack does not have", () => {
		expect(
			rules(errors(swap(BASE, "needs: [TaskStorage.claim]", "needs: [Memory.search]"))),
		).toContain("missing-capability");
	});
	test("a step that uses a block the stack does not list", () => {
		expect(rules(errors(swap(BASE, "    block: c/review", "    block: c/reviewer")))).toEqual([
			"invalid",
		]);
	});
});

describe("blocks' own declarations", () => {
	const all = () =>
		new Map([
			["a/plan", annotation("a/plan", ["done"])],
			["b/build", annotation("b/build", ["DONE"])],
			["c/review", annotation("c/review", ["pass", "fail"])],
		]);
	test("matching outcomes pass, whatever their case", () => {
		expect(errors(BASE, all())).toEqual([]);
	});
	test("an outcome the block can end with and the stack does not route", () => {
		const annotations = all().set("b/build", annotation("b/build", ["done", "BLOCKED"]));
		expect(one(errors(BASE, annotations), "unrouted-outcome").message).toContain("`blocked`");
	});
	test("an outcome the stack routes and the block never reports is a warning", () => {
		const annotations = all().set("c/review", annotation("c/review", ["pass"]));
		expect(one(check(BASE, annotations), "undeclared-outcome").severity).toBe("warning");
	});
	test("a part is checked against its own outcomes", () => {
		const parts = new Map([["gate", { lines: "1-9", outcomes: ["pass", "fail"] }]]);
		const annotations = all().set(
			"c/review",
			annotation("c/review", ["something-else"], { parts }),
		);
		expect(
			errors(swap(BASE, "    block: c/review", "    block: c/review#gate"), annotations),
		).toEqual([]);
		expect(
			rules(errors(swap(BASE, "    block: c/review", "    block: c/review#nope"), annotations)),
		).toContain("invalid");
	});
	test("a block written for a component of a type the stack does not use", () => {
		const touch = (component: string) => [{ component, lines: "3-4" }];
		const withTouch = (component: string) =>
			errors(
				BASE,
				all().set("b/build", annotation("b/build", ["done"], { touches: touch(component) })),
			);
		expect(withTouch("components/TaskStorage/beads.md")).toEqual([]);
		expect(one(withTouch("components/Memory/wiki.md"), "invalid").message).toContain("`Memory`");
		expect(one(withTouch("TaskStorage"), "invalid").message).toContain("not a card path");
	});
	test("a listed block without an annotation", () => {
		const annotations = all();
		annotations.delete("c/review");
		expect(one(errors(BASE, annotations), "invalid").message).toContain("c/review");
	});
});

describe("levels", () => {
	test("the levels are written out, and skipped steps are passed through", () => {
		const { flat } = loadStack(LEVELED);
		expect([...(flat?.nodes.keys() ?? [])]).toEqual([
			"epic/define",
			"epic/decompose",
			"epic/build",
			"epic/verify",
			"task/define",
			"task/build",
			"task/verify",
			"epic/build.child-escalated",
		]);
		const edges = (from: string) =>
			flat?.edges.filter((e) => e.from === from).map((e) => `${e.outcome} -> ${e.to}`);
		expect(edges("epic/build")).toEqual(["next-child -> task/define", "all-done -> epic/verify"]);
		// A task that ends `done` returns to the epic's build; one that ends `escalated` takes `children.escalated`.
		expect(edges("task/verify")).toEqual([
			"pass -> epic/build",
			"fail -> task/build",
			"fail -> epic/build.child-escalated",
		]);
		expect(edges("epic/build.child-escalated")).toEqual([
			"escalated -> epic/decompose",
			"escalated -> escalated",
		]);
	});
	test("a child cannot rely on what its sibling wrote", () => {
		// The task's build now reads the task's verdict, which only an earlier task could have written.
		const finding = one(
			errors(
				swap(
					LEVELED,
					"task: { reads: [define], outcomes",
					"task: { reads: [define, verdict], outcomes",
				),
			),
			"read-before-write",
		);
		expect(finding.message).toContain("task/build reads `verdict@task`");
	});
	test("what the parent writes for its children survives from one child to the next", () => {
		expect(rules(errors(LEVELED))).not.toContain("read-before-write");
	});
	test("a parent that writes nothing for its children is caught", () => {
		const findings = errors(
			swap(LEVELED, 'writes: [children, "child:define"]', "writes: [children]"),
		);
		expect(findings.map((finding) => finding.message)).toEqual([
			"task/define reads `define@task`, which no step writes and the user does not provide",
			"task/build reads `define@task`, which no step writes and the user does not provide",
		]);
	});
	test("a child's bound starts again for each child, so the loop still ends", () => {
		expect(rules(errors(LEVELED))).not.toContain("bounds-reset");
	});
	test("a parent loop bounded only by its children's count is caught", () => {
		// Going back to decompose starts the count of children again, so that count bounds nothing.
		const yaml = swap(
			LEVELED,
			'escalated: { to: decompose, max: 2, then: escalated, releases: ["child:task"] }',
			'escalated: { to: decompose, releases: ["child:task"] }',
		);
		expect(one(errors(yaml), "bounds-reset").message).toContain(
			"epic/build.next-child is bounded, but epic/decompose.done sets its count back",
		);
	});
	test("a child that gives up while holding a claim leaks it", () => {
		const yaml = swap(LEVELED, ', releases: ["child:task"] }', " }");
		const finding = one(errors(yaml), "leaked-claim");
		expect(finding.message).toContain("`task@task`");
		expect(finding.trace?.at(-1)).toBe("epic/build.child-escalated -(escalated)-> escalated");
	});
	test("a way for a child to end that the parent does not route", () => {
		const yaml = swap(
			LEVELED,
			'      escalated: { to: decompose, max: 2, then: escalated, releases: ["child:task"] }\n',
			"",
		);
		expect(rules(errors(yaml))).toContain("unrouted-outcome");
	});
	test("levels without a step that descends are invalid", () => {
		const yaml = LEVELED.replace(
			/ {4}children:\n {6}done: verify\n.*\n/,
			"    outcomes: { done: verify }\n",
		);
		expect(rules(errors(yaml))).toEqual(["invalid"]);
	});
	test("`files` gives a path per artifact, for every level or for one", () => {
		const yaml = swap(
			LEVELED,
			"steps:\n",
			"files:\n  define: { epic: notes/define.md, task: notes/briefs/<ref>.md }\n  children: notes/tasks.md\n  result: notes/result.md\n  verdict: notes/verdict.md\nsteps:\n",
		);
		const { flat } = loadStack(yaml);
		expect(flat?.paths.get("define@task")).toBe("notes/briefs/<ref>.md");
		expect(flat?.paths.get("children")).toBe("notes/tasks.md");
		expect(check(yaml).filter((f) => f.rule === "no-path")).toEqual([]);
	});
	test("an artifact that is written and has no path is a warning, once `files` is used", () => {
		expect(check(LEVELED).filter((f) => f.rule === "no-path")).toEqual([]);
		const yaml = swap(LEVELED, "steps:\n", "files:\n  children: notes/tasks.md\nsteps:\n");
		const missing = check(yaml).filter((f) => f.rule === "no-path");
		expect(missing.every((f) => f.severity === "warning")).toBe(true);
		expect(missing.map((f) => f.message).join()).toContain("`verdict@epic`");
		expect(missing.map((f) => f.message).join()).not.toContain("`children@epic`");
	});
	test("`files` with a level the stack does not have, or a path that is not text", () => {
		const bad = (files: string) => errors(swap(LEVELED, "steps:\n", `files:\n${files}\nsteps:\n`));
		expect(one(bad("  define: { story: notes/define.md }"), "invalid").message).toContain("story");
		expect(one(bad("  define: { epic: [a] }"), "invalid").message).toContain("files.define.epic");
		expect(one(bad("  define: [a]"), "invalid").message).toContain("files.define");
	});
	test("`inside` names a level below the first and a block of the stack", () => {
		const leveled = LEVELED.replace(
			"steps:\n",
			"blocks:\n  a/lead: { kind: skill, as: lead, role: router }\n  a/dev: { kind: prompt, as: dev }\nsteps:\n",
		);
		const inside = (value: string) => swap(leveled, "steps:\n", `inside: ${value}\nsteps:\n`);
		const { flat } = loadStack(inside("{ task: a/dev }"));
		expect(flat?.inside.get("task")).toBe("a/dev");
		expect(one(errors(inside("{ epic: a/dev }")), "invalid").message).toContain("`epic`");
		expect(one(errors(inside("{ story: a/dev }")), "invalid").message).toContain("`story`");
		expect(rules(errors(inside("{ task: a/nobody }")))).toEqual(["invalid"]);
	});
	test("`child:` below the last level is invalid", () => {
		expect(
			rules(
				errors(
					swap(LEVELED, "task: { claims: [task],", 'task: { writes: ["child:x"], claims: [task],'),
				),
			),
		).toContain("invalid");
	});
});
