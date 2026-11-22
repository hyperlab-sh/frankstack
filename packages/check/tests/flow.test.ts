import { describe, expect, test } from "bun:test";
import { analyze } from "../src/analyze.ts";
import { ALL_DONE, base, loadFlow, NEXT_CHILD } from "../src/flow.ts";
import type { BundleBlock, Definition, Edge, Io } from "../src/types.ts";
import { one } from "./fixture.ts";

const io = (kind: string, required = false): Io => ({ kind, required });
const made = (name: string, over: Partial<Definition> = {}): [string, BundleBlock] => [
	name,
	{
		name,
		origin: "created",
		references: new Map(),
		def: {
			kind: "skill",
			does: "Does one thing.",
			references: new Map(),
			uses: new Map(),
			provides: new Map(),
			inputs: new Map(),
			outputs: new Map(),
			outcomes: [],
			parts: new Map(),
			...over,
		},
	},
];
const BLOCKS = new Map<string, BundleBlock>([
	made("lead"),
	made("runner"),
	made("builder", {
		inputs: new Map([
			["plan", io("plan", true)],
			["notes", io("findings")],
		]),
		outputs: new Map([["change", io("change")]]),
		outcomes: ["done"],
	}),
	made("reviewer", {
		kind: "agent",
		inputs: new Map([["change", io("change", true)]]),
		outputs: new Map([["findings", io("findings")]]),
		outcomes: ["pass", "fail"],
	}),
	made("shouty", { outcomes: ["PASS", "Not_Ready"] }),
	made("gated", {
		inputs: new Map([["plan", io("plan", true)]]),
		outcomes: ["done"],
		parts: new Map([["gate", ["pass", "fail"]]]),
	}),
	made("loose"),
]);
const CROSS = new Map([["learnings", "lessons"]]);

type Step = Record<string, unknown>;
type Flow = Record<string, unknown> & { steps: Record<string, Step> };

function run(doc: unknown) {
	const { flat, findings } = loadFlow("ship", doc, { blocks: BLOCKS, crossRun: CROSS });
	if (!flat) return { flat, findings };
	return { flat, findings: [...findings, ...analyze(flat, { blocks: BLOCKS, need: () => [] })] };
}
const found = (doc: unknown) => run(doc).findings;
/** Every finding as its rule and its message. */
const all = (doc: unknown) => found(doc).map((finding) => [finding.rule, finding.message]);
const said = (doc: unknown, rule: string) =>
	found(doc)
		.filter((finding) => finding.rule === rule)
		.map((finding) => finding.message);
const arrow = (edge: Edge) => `${edge.from} -(${edge.outcome})-> ${edge.to}`;

/** A flow with some steps changed or added, and some top-level keys replaced. */
function edit(doc: Flow, steps: Record<string, Step>, top: Record<string, unknown> = {}): Flow {
	const merged: Record<string, Step> = {};
	for (const name of new Set([...Object.keys(doc.steps), ...Object.keys(steps)]))
		merged[name] = { ...doc.steps[name], ...steps[name] };
	return { ...doc, ...top, steps: merged };
}
const without = (from: unknown, ...keys: string[]) =>
	Object.fromEntries(Object.entries(from as object).filter(([key]) => !keys.includes(key)));

/** One level: plan, build, review with three tries, then learn; a claim held from build to the end. */
const BASE: Flow = {
	description: "From a request to a reviewed change.",
	lead: "lead",
	start: "plan",
	ends: ["done", "escalated"],
	inputs: ["request"],
	artifacts: { request: "request", plan: "plan", change: "change", findings: "findings" },
	files: {
		plan: "notes/plan.md",
		change: "(the working tree)",
		findings: "notes/findings.md",
		learnings: "notes/learnings.md",
		counters: "notes/counters.json",
	},
	steps: {
		plan: {
			does: "Plan the work.",
			reads: ["request", { artifact: "learnings", optional: true }],
			writes: ["plan"],
			outcomes: { done: "build" },
		},
		build: {
			reads: ["plan", { artifact: "findings", optional: true }],
			writes: ["change"],
			claims: ["task"],
			outcomes: { done: "review" },
		},
		review: {
			reads: ["change"],
			writes: ["findings"],
			outcomes: {
				pass: { to: "learn", releases: ["task"] },
				fail: { to: "build", max: 3, then: "abandon" },
			},
		},
		abandon: { releases: ["task"], outcomes: { done: "escalated" } },
		learn: { reads: ["findings"], writes: ["learnings"], outcomes: { done: "done" } },
	},
};

/** Two levels: an epic is defined, cut into tasks, each task runs the same steps, the epic is verified. */
const LEVELED: Flow = {
	lead: "lead",
	levels: ["epic", "task"],
	start: "define",
	ends: ["done", "escalated"],
	inputs: ["request"],
	artifacts: {
		request: "request",
		spec: "requirements",
		tasks: "plan",
		change: "change",
		verdict: "verdict",
	},
	files: {
		spec: { epic: "notes/spec.md", task: "notes/tasks/spec.md" },
		tasks: "notes/tasks.md",
		change: "(the working tree)",
		verdict: "notes/verdict.md",
		counters: "notes/counters.json",
	},
	steps: {
		define: {
			reads: ["request"],
			writes: ["spec"],
			outcomes: { done: "decompose" },
			at: { task: { reads: ["parent:tasks"] } },
		},
		decompose: { only: ["epic"], reads: ["spec"], writes: ["tasks"], outcomes: { done: "build" } },
		build: {
			reads: ["spec", { artifact: "verdict", optional: true }],
			writes: ["change"],
			claims: ["task"],
			outcomes: { done: "verify" },
			children: {
				done: "verify",
				escalated: { to: "decompose", max: 2, then: "escalated", releases: ["child:task"] },
			},
			at: {
				epic: {
					reads: ["tasks", { artifact: "verdict", optional: true }],
					writes: [],
					claims: [],
					outcomes: {},
				},
			},
		},
		verify: {
			reads: ["spec", "change"],
			writes: ["verdict"],
			outcomes: {
				pass: { to: "done", releases: ["task"] },
				fail: { to: "build", max: 2, then: "escalated" },
			},
			at: { epic: { reads: ["spec"] } },
		},
	},
};

describe("a sound flow", () => {
	test("has no finding and is written out as a graph", () => {
		const { flat, findings } = run(BASE);
		expect(findings).toEqual([]);
		expect(flat?.name).toBe("ship");
		expect(flat?.lead).toBe("lead");
		expect(flat?.levels).toEqual([""]);
		expect(flat?.start).toBe("plan");
		expect([...(flat?.nodes.keys() ?? [])]).toEqual([
			"plan",
			"build",
			"review",
			"abandon",
			"learn",
		]);
		expect(flat?.edges.map(arrow)).toEqual([
			"plan -(done)-> build",
			"build -(done)-> review",
			"review -(pass)-> learn",
			"review -(fail)-> build",
			"review -(fail)-> abandon",
			"abandon -(done)-> escalated",
			"learn -(done)-> done",
		]);
		const [tries, usedUp] = flat?.edges.filter((edge) => edge.outcome === "fail") ?? [];
		expect(tries?.bound).toEqual({ counter: "review.fail", kind: "max", max: 3 });
		expect(tries?.exhausted).toBe(false);
		expect(usedUp?.bound).toBeUndefined();
		expect(usedUp?.exhausted).toBe(true);
		expect(flat?.kinds.get("learnings")).toBe("lessons");
		expect(flat?.paths.get("plan")).toBe("notes/plan.md");
	});

	test("a step reads what the lead handles and what it gives its block", () => {
		const doc = edit(BASE, {
			build: {
				block: "builder",
				reads: ["request"],
				writes: [],
				inputs: { plan: "plan", notes: "findings" },
				outputs: { change: "change" },
			},
		});
		const { flat, findings } = run(doc);
		expect(findings).toEqual([]);
		const build = flat?.nodes.get("build");
		expect(build?.block).toBe("builder");
		expect(build?.reads).toEqual([
			{ artifact: "request", optional: false },
			{ artifact: "plan", optional: false },
			{ artifact: "findings", optional: true },
		]);
		expect(build?.writes).toEqual(["change"]);
	});
});

describe("a flow that is not written as the format says", () => {
	test("is not a mapping", () => {
		expect(all(["plan"])).toEqual([["invalid", "a flow must be a mapping"]]);
	});

	test("has no lead, start, ends or steps", () => {
		expect(all({ description: "Nothing." })).toEqual([
			["invalid", "`lead` is missing"],
			["invalid", "`ends` must list at least one end"],
			["invalid", "`start` is missing"],
			["invalid", "`steps` is missing or empty"],
		]);
	});

	test("has a key the format does not have", () => {
		expect(all({ ...BASE, loops: 3 })).toEqual([["invalid", "unknown key `loops`"]]);
	});

	test("every finding carries the flow's name", () => {
		for (const finding of found({ ...BASE, loops: 3 })) expect(finding.flow).toBe("ship");
		for (const finding of found(edit(BASE, { learn: { outcomes: {} } })))
			expect(finding.flow).toBe("ship");
	});

	test("names a lead or a block the bundle does not list", () => {
		expect(all({ ...BASE, lead: "boss" })).toEqual([
			["unknown-block", "lead: `boss` is not listed under `blocks`"],
		]);
		expect(all(edit(BASE, { review: { block: "ghost" } }))).toEqual([
			["unknown-block", "review: `ghost` is not listed under `blocks`"],
		]);
		expect(all(edit(BASE, { review: { block: "ghost#gate" } }))).toEqual([
			["unknown-block", "review: `ghost` is not listed under `blocks`"],
		]);
	});

	test("starts at something that is not a step", () => {
		expect(all({ ...BASE, start: "nowhere" })).toEqual([
			["invalid", "start: `nowhere` is neither a step nor an end of this flow"],
		]);
	});

	test("has a step that is not a mapping, has an unknown key, or the name of an end", () => {
		expect(said(edit(BASE, { plan: { prompt: "Plan it." } }), "invalid")).toEqual([
			"step `plan`: unknown key `prompt`",
		]);
		expect(said({ ...BASE, steps: { ...BASE.steps, extra: "learn" } }, "invalid")).toEqual([
			"step `extra` must be a mapping",
		]);
		expect(said(edit(BASE, { done: { outcomes: { done: "done" } } }), "invalid")).toEqual([
			"step `done` has the name of an end",
		]);
	});

	describe("routes", () => {
		const fail = (route: unknown) =>
			all(
				edit(BASE, {
					review: { outcomes: { pass: { to: "learn", releases: ["task"] }, fail: route } },
				}),
			);

		test("a target that is neither a step nor an end", () => {
			expect(fail("nowhere")).toEqual([
				["invalid", "review.fail: `nowhere` is neither a step nor an end of this flow"],
			]);
			expect(fail({ to: "build", max: 3, then: "nowhere" })).toEqual([
				["invalid", "review.fail: `nowhere` is neither a step nor an end of this flow"],
			]);
		});

		test("a route of the wrong shape", () => {
			const message = "review.fail: a route is a step name or a mapping with `to`";
			expect(fail(3)).toEqual([["invalid", message]]);
			expect(fail({ max: 3 })).toEqual([["invalid", message]]);
			expect(fail(["build"])).toEqual([["invalid", message]]);
		});

		test("a key a route does not have", () => {
			expect(fail({ to: "build", max: 3, then: "abandon", limit: 3 })).toEqual([
				["invalid", "review.fail: unknown route key `limit`"],
			]);
		});

		test("a bound that is not a whole number above zero", () => {
			const message = "review.fail: `max` must be a whole number above zero";
			for (const max of [0, -1, 1.5, "3"])
				expect(fail({ to: "build", max, then: "abandon" })).toEqual([["invalid", message]]);
		});

		test("`then` with no bound", () => {
			expect(fail({ to: "build", then: "abandon" })).toEqual([
				["invalid", "review.fail: `then` needs `max`"],
			]);
		});

		test("`resets` naming a route that is not counted", () => {
			expect(fail({ to: "build", max: 3, then: "abandon", resets: ["build.done"] })).toEqual([
				["invalid", "review.fail: `resets` names `build.done`, which has no `max`"],
			]);
		});
	});

	test("blocks around the flow need a name the bundle lists", () => {
		expect(found({ ...BASE, around: [{ block: "reviewer" }] })).toEqual([]);
		expect(all({ ...BASE, around: [{ block: "ghost" }] })).toEqual([
			["unknown-block", "around: `ghost` is not listed under `blocks`"],
		]);
		expect(all({ ...BASE, around: ["reviewer"] })).toEqual([
			["invalid", "each entry of `around` needs `block`"],
		]);
	});
});

describe("artifacts and where they are kept", () => {
	test("an artifact with no kind", () => {
		expect(all({ ...BASE, artifacts: without(BASE.artifacts, "plan") })).toEqual([
			["no-kind", "`plan` (plan) has no kind under `artifacts`"],
		]);
		expect(all({ ...BASE, artifacts: without(BASE.artifacts, "request") })).toEqual([
			["no-kind", "`request` (inputs) has no kind under `artifacts`"],
		]);
	});

	test("an artifact kept between runs takes its kind from the bundle", () => {
		expect(
			found({ ...BASE, artifacts: { ...(BASE.artifacts as object), learnings: "lessons" } }),
		).toEqual([]);
		expect(
			all({ ...BASE, artifacts: { ...(BASE.artifacts as object), learnings: "report" } }),
		).toEqual([
			[
				"invalid",
				"artifacts.learnings: the bundle keeps `learnings` between runs as a lessons, the flow says report",
			],
		]);
	});

	test("a kind the language does not have, or that is not a name", () => {
		expect(all({ ...BASE, artifacts: { ...(BASE.artifacts as object), plan: "roadmap" } })).toEqual(
			[["unknown-term", "artifacts.plan: `roadmap` is not an artifact kind"]],
		);
		expect(
			all({ ...BASE, artifacts: { ...(BASE.artifacts as object), plan: { kind: "plan" } } }),
		).toEqual([["invalid", "artifacts.plan: must be an artifact kind"]]);
	});

	test("a written artifact with no place", () => {
		expect(all({ ...BASE, files: without(BASE.files, "plan") })).toEqual([
			["no-path", "`plan` is written by plan, and `files` gives it no place"],
		]);
	});

	test("an artifact the user provides needs no place", () => {
		expect(run(BASE).flat?.paths.has("request")).toBe(false);
	});

	test("a counted route with no place for the counts", () => {
		expect(all({ ...BASE, files: without(BASE.files, "counters") })).toEqual([
			["no-path", "review.fail is counted, and `files.counters` gives the counts no place"],
		]);
		const uncounted = edit(BASE, {
			review: { outcomes: { pass: { to: "learn", releases: ["task"] }, fail: "abandon" } },
		});
		expect(found({ ...uncounted, files: without(BASE.files, "counters") })).toEqual([]);
	});

	test("a place that is not a path", () => {
		const files = (over: Record<string, unknown>) =>
			all({ ...BASE, files: { ...(BASE.files as object), ...over } });
		expect(files({ plan: 3 })).toEqual([
			["invalid", "files.plan: a path, or a mapping of level to path"],
		]);
		expect(files({ counters: { epic: "notes/counters.json" } })).toEqual([
			["invalid", "files.counters: must be a path"],
		]);
		expect(files({ plan: { epic: "notes/plan.md" } })).toEqual([
			["invalid", "files.plan: unknown level `epic`"],
		]);
	});
});

describe("what a step reads must have been written", () => {
	const research = (planRoutes: Step, reads: unknown[]) =>
		edit(
			BASE,
			{
				plan: { outcomes: planRoutes },
				research: { reads: ["request"], writes: ["research"], outcomes: { done: "build" } },
				build: { reads },
			},
			{
				artifacts: { ...(BASE.artifacts as object), research: "findings" },
				files: { ...(BASE.files as object), research: "notes/research.md" },
			},
		);

	test("written on one branch only", () => {
		const finding = one(
			found(research({ done: "build", unclear: "research" }, ["plan", "research"])),
			"read-before-write",
		);
		expect(finding.message).toBe("build reads `research`, which is not written on this path");
		expect(finding.trace).toEqual(["plan -(done)-> build"]);
		expect(finding.severity).toBe("error");
	});

	test("written on every branch", () => {
		expect(found(research({ done: "research" }, ["plan", "research"]))).toEqual([]);
	});

	test("an optional read may find nothing", () => {
		expect(
			found(
				research({ done: "build", unclear: "research" }, [
					"plan",
					{ artifact: "research", optional: true },
				]),
			),
		).toEqual([]);
	});

	test("written later in the loop only", () => {
		const finding = one(
			found(edit(BASE, { build: { reads: ["plan", "findings"] } })),
			"read-before-write",
		);
		expect(finding.message).toBe("build reads `findings`, which is not written on this path");
		expect(finding.trace).toEqual(["plan -(done)-> build"]);
	});

	test("kept from earlier runs, so missing on a first run", () => {
		const finding = one(
			found(edit(BASE, { plan: { reads: ["request", "learnings"] } })),
			"first-run-read",
		);
		expect(finding.message).toBe(
			"plan reads `learnings`, which is kept from earlier runs: on a first run nothing has written it yet",
		);
		expect(finding.trace).toEqual([]);
	});

	test("kept from earlier runs and written earlier in this one", () => {
		expect(found(edit(BASE, { learn: { reads: ["findings"] }, abandon: { reads: [] } }))).toEqual(
			[],
		);
		const reread = edit(BASE, {
			learn: { outcomes: { done: "recap" } },
			recap: { reads: ["learnings"], outcomes: { done: "done" } },
		});
		expect(found(reread)).toEqual([]);
	});

	test("written by no step and not provided", () => {
		const doc = edit(BASE, { build: { reads: ["plan", "spec"] } });
		expect(
			all({ ...doc, artifacts: { ...(BASE.artifacts as object), spec: "requirements" } }),
		).toEqual([
			["no-writer", "build reads `spec`, which no step writes and the user does not provide"],
		]);
	});

	test("a read of the wrong shape", () => {
		expect(all(edit(BASE, { build: { reads: ["plan", 3] } }))).toEqual([
			["invalid", "build: a read is an artifact name or `{ artifact, optional }`"],
		]);
	});

	test("written and read by no step is a warning", () => {
		const doc = edit(
			BASE,
			{ build: { writes: ["change", "log"] } },
			{
				artifacts: { ...(BASE.artifacts as object), log: "report" },
				files: { ...(BASE.files as object), log: "notes/log.md" },
			},
		);
		expect(found(doc)).toEqual([
			{
				rule: "never-read",
				severity: "warning",
				flow: "ship",
				message: "`log` is written by build and read by no step",
				trace: undefined,
			},
		]);
	});
});

describe("every loop runs out", () => {
	const review = (fail: unknown) =>
		edit(BASE, { review: { outcomes: { pass: { to: "learn", releases: ["task"] }, fail } } });

	test("a loop with no bound", () => {
		const finding = one(found(review("build")), "unbounded-cycle");
		expect(finding.message).toBe("this loop has no bound, so the run may never end");
		expect(finding.trace).toEqual(["review -(fail)-> build", "build -(done)-> review"]);
	});

	test("a step that routes to itself with no bound", () => {
		const doc = edit(BASE, { build: { outcomes: { done: "review", again: "build" } } });
		expect(one(found(doc), "unbounded-cycle").trace).toEqual(["build -(again)-> build"]);
	});

	test("a bound with nothing after it", () => {
		expect(all(review({ to: "build", max: 3 }))).toEqual([
			[
				"bound-without-route",
				"review.fail may be taken 3 times, but nothing says where it leads after that (add `then`)",
			],
			["unreachable-step", "no path from the start reaches abandon"],
		]);
	});

	const stuck = (failResets: string[], stuckResets: string[]) =>
		edit(BASE, {
			build: {
				outcomes: {
					done: "review",
					stuck: { to: "plan", max: 2, then: "abandon", resets: stuckResets },
				},
			},
			review: {
				outcomes: {
					pass: { to: "learn", releases: ["task"] },
					fail: { to: "build", max: 3, then: "abandon", resets: failResets },
				},
			},
		});

	test("two bounds, one inside the other, both run out", () => {
		expect(found(stuck([], []))).toEqual([]);
		expect(found(stuck(["build.stuck"], []))).toEqual([]);
		expect(found(stuck([], ["review.fail"]))).toEqual([]);
	});

	test("two bounds that set each other back", () => {
		const finding = one(found(stuck(["build.stuck"], ["review.fail"])), "bounds-reset");
		expect(finding.message).toBe(
			"the bounds of this loop reset each other, so the run may never end: build.stuck is bounded, but review.fail sets its count back; review.fail is bounded, but build.stuck sets its count back",
		);
		expect(finding.trace?.length).toBeGreaterThan(1);
	});

	test("the edge a counter records its resets on", () => {
		const fail = run(stuck(["build.stuck"], [])).flat?.edges.filter(
			(edge) => edge.outcome === "fail",
		);
		expect(fail?.map((edge) => edge.resets)).toEqual([["build.stuck"], []]);
	});
});

describe("every step is reached and leads to an end", () => {
	test("a step nothing leads to", () => {
		expect(all(edit(BASE, { orphan: { outcomes: { done: "done" } } }))).toEqual([
			["unreachable-step", "no path from the start reaches orphan"],
		]);
	});

	test("a step with no outcome", () => {
		expect(all(edit(BASE, { learn: { outcomes: {} } }))).toEqual([
			["dead-end", "learn has no outcome, so the run stops there"],
		]);
		expect(all(edit(BASE, { learn: { outcomes: undefined } }))).toEqual([
			["dead-end", "learn has no outcome, so the run stops there"],
		]);
	});

	test("steps from which no end can be reached", () => {
		const doc = edit(BASE, {
			learn: { outcomes: { done: "idle" } },
			idle: { outcomes: { again: { to: "idle", max: 2, then: "learn" } } },
		});
		expect(said(doc, "end-unreachable")).toEqual([
			"no path from learn reaches an end",
			"no path from idle reaches an end",
		]);
	});
});

describe("claims", () => {
	test("a claim still held at an end", () => {
		const doc = edit(BASE, {
			review: { outcomes: { pass: "learn", fail: { to: "build", max: 3, then: "abandon" } } },
		});
		const finding = one(found(doc), "leaked-claim");
		expect(finding.message).toBe("the claim `task` is still held when the run ends");
		expect(finding.trace).toEqual([
			"plan -(done)-> build",
			"build -(done)-> review",
			"review -(pass)-> learn",
			"learn -(done)-> done",
		]);
	});

	test("a claim held on the way out when the tries are used up", () => {
		const finding = one(found(edit(BASE, { abandon: { releases: [] } })), "leaked-claim");
		expect(finding.trace).toEqual([
			"plan -(done)-> build",
			"build -(done)-> review",
			"review -(fail)-> abandon",
			"abandon -(done)-> escalated",
		]);
	});

	test("a claim released by the step that takes it is never held", () => {
		const doc = edit(BASE, {
			build: { releases: ["task"] },
			review: { outcomes: { pass: "learn", fail: { to: "build", max: 3, then: "abandon" } } },
			abandon: { releases: [] },
		});
		expect(found(doc)).toEqual([]);
	});

	test("a release on the route out of the claiming step", () => {
		const doc = edit(BASE, {
			build: { outcomes: { done: { to: "review", releases: ["task"] } } },
			review: { outcomes: { pass: "learn", fail: { to: "build", max: 3, then: "abandon" } } },
			abandon: { releases: [] },
		});
		expect(found(doc)).toEqual([]);
	});
});

describe("a step against the block it uses", () => {
	const reviewed = (step: Step) =>
		edit(BASE, {
			review: {
				block: "reviewer",
				reads: [],
				writes: [],
				inputs: { change: "change" },
				outputs: { findings: "findings" },
				...step,
			},
		});
	const toReview = ["plan -(done)-> build", "build -(done)-> review"];

	test("gives every required input an artifact of the right kind", () => {
		expect(found(reviewed({}))).toEqual([]);
	});

	test("a required input with no artifact", () => {
		const finding = one(found(reviewed({ inputs: {}, reads: ["change"] })), "missing-input");
		expect(finding.message).toBe(
			"review gives no artifact for `change`, a required input of `reviewer`",
		);
		expect(finding.trace).toEqual(toReview);
	});

	test("an artifact of another kind than the input or the output", () => {
		const input = one(
			found(reviewed({ inputs: { change: "plan" }, reads: ["change"] })),
			"artifact-kind",
		);
		expect(input.message).toBe(
			"review gives `plan`, a plan, for `change` of `reviewer`, which is a change",
		);
		expect(input.trace).toEqual(toReview);
		const doc = reviewed({ outputs: { findings: "verdict" }, writes: ["findings"] });
		const output = one(
			found({
				...doc,
				artifacts: { ...(BASE.artifacts as object), verdict: "verdict" },
				files: { ...(BASE.files as object), verdict: "notes/verdict.md" },
				steps: { ...doc.steps, learn: { ...doc.steps.learn, reads: ["findings", "verdict"] } },
			}),
			"artifact-kind",
		);
		expect(output.message).toBe(
			"review gives `verdict`, a verdict, for `findings` of `reviewer`, which is a findings",
		);
	});

	test("an input or an output the block does not have", () => {
		expect(said(reviewed({ inputs: { change: "change", notes: "plan" } }), "invalid")).toEqual([
			"review gives `plan` for `notes`, which is not an input of `reviewer`",
		]);
		expect(
			said(reviewed({ outputs: { findings: "findings", report: "findings" } }), "invalid"),
		).toEqual(["review gives `findings` for `report`, which is not an output of `reviewer`"]);
	});

	test("inputs and outputs of the wrong shape", () => {
		expect(all(reviewed({ inputs: ["change"] }))).toEqual([
			["invalid", "review: `inputs` maps each input of the block to an artifact"],
		]);
		expect(all(reviewed({ outputs: { findings: 3 } }))).toEqual([
			["invalid", "review: `outputs.findings` must name an artifact"],
		]);
		expect(all(edit(BASE, { plan: { outputs: { plan: "plan" } } }))).toEqual([
			[
				"invalid",
				"plan: `outputs` needs a block; what the lead itself handles goes under `reads` and `writes`",
			],
		]);
	});

	test("an artifact given for an input the block can do without may not exist yet", () => {
		const build = (notes: Io) => {
			const blocks = new Map(BLOCKS);
			blocks.set(
				...made("builder", {
					inputs: new Map([
						["plan", io("plan", true)],
						["notes", notes],
					]),
					outputs: new Map([["change", io("change")]]),
					outcomes: ["done"],
				}),
			);
			const doc = edit(BASE, {
				build: {
					block: "builder",
					reads: [],
					writes: [],
					inputs: { plan: "plan", notes: "findings" },
					outputs: { change: "change" },
				},
			});
			const { flat, findings } = loadFlow("ship", doc, { blocks, crossRun: CROSS });
			return flat ? [...findings, ...analyze(flat, { blocks, need: () => [] })] : findings;
		};
		expect(build(io("findings", false))).toEqual([]);
		expect(build(io("findings", true)).map((finding) => finding.message)).toEqual([
			"build reads `findings`, which is not written on this path",
		]);
	});

	test("an outcome of the block the step does not route", () => {
		const finding = one(
			found(reviewed({ outcomes: { pass: { to: "learn", releases: ["task"] } } })),
			"unrouted-outcome",
		);
		expect(finding.message).toBe("`reviewer` can end `fail`, and review does not route it");
		expect(finding.trace).toEqual(toReview);
		expect(finding.severity).toBe("error");
	});

	test("a route for an outcome the block does not declare is a warning", () => {
		const doc = reviewed({
			outcomes: {
				pass: { to: "learn", releases: ["task"] },
				fail: { to: "build", max: 3, then: "abandon" },
				maybe: "abandon",
			},
		});
		expect(found(doc)).toEqual([
			{
				rule: "undeclared-outcome",
				severity: "warning",
				flow: "ship",
				message: "review routes `maybe`, which `reviewer` does not say it can end with",
				trace: undefined,
			},
		]);
	});

	test("outcomes match whatever their case and their separator", () => {
		const doc = edit(BASE, {
			review: {
				block: "shouty",
				outcomes: {
					pass: { to: "learn", releases: ["task"] },
					"not-ready": { to: "build", max: 3, then: "abandon" },
				},
			},
		});
		expect(found(doc)).toEqual([]);
	});

	test("a block that declares no outcome can be routed any way", () => {
		expect(found(edit(BASE, { review: { block: "loose" } }))).toEqual([]);
	});

	test("a part of a block has its own outcomes, and is not asked for the block's inputs", () => {
		expect(found(edit(BASE, { review: { block: "gated#gate" } }))).toEqual([]);
		expect(
			run(edit(BASE, { review: { block: "gated#gate" } })).flat?.nodes.get("review")?.part,
		).toBe("gate");
		expect(said(edit(BASE, { review: { block: "gated" } }), "missing-input")).toEqual([
			"review gives no artifact for `plan`, a required input of `gated`",
		]);
		expect(all(edit(BASE, { review: { block: "gated#nope" } }))).toEqual([
			["invalid", "review uses part `nope` of `gated`, which the block does not define"],
		]);
	});
});

describe("levels", () => {
	test("a sound flow with levels is written out once per level", () => {
		const { flat, findings } = run(LEVELED);
		expect(findings).toEqual([]);
		expect(flat?.levels).toEqual(["epic", "task"]);
		expect(flat?.start).toBe("epic/define");
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
		expect(flat?.edges.map(arrow)).toEqual([
			"epic/define -(done)-> epic/decompose",
			"epic/decompose -(done)-> epic/build",
			`epic/build -(${NEXT_CHILD})-> task/define`,
			`epic/build -(${ALL_DONE})-> epic/verify`,
			"epic/verify -(pass)-> done",
			"epic/verify -(fail)-> epic/build",
			"epic/verify -(fail)-> escalated",
			"task/define -(done)-> task/build",
			"task/build -(done)-> task/verify",
			"task/verify -(pass)-> epic/build",
			"task/verify -(fail)-> task/build",
			"task/verify -(fail)-> epic/build.child-escalated",
			"epic/build.child-escalated -(escalated)-> epic/decompose",
			"epic/build.child-escalated -(escalated)-> escalated",
		]);
	});

	test("a step is what `at` makes it at each level", () => {
		const nodes = run(LEVELED).flat?.nodes;
		expect(nodes?.get("epic/define")?.reads).toEqual([{ artifact: "request", optional: false }]);
		expect(nodes?.get("task/define")?.reads).toEqual([{ artifact: "tasks@epic", optional: false }]);
		expect(nodes?.get("task/define")?.writes).toEqual(["spec@task"]);
		expect(nodes?.get("epic/build")?.descends).toBe(true);
		expect(nodes?.get("epic/build")?.childRoutes).toEqual(["done", "escalated"]);
		expect(nodes?.get("epic/build")?.claims).toEqual([]);
		expect(nodes?.get("task/build")?.descends).toBe(false);
		expect(nodes?.get("task/build")?.claims).toEqual(["task@task"]);
		expect(nodes?.get("epic/build.child-escalated")?.synthetic).toBe(true);
		expect(base("spec@task")).toBe("spec");
	});

	test("starting a child clears what the last child wrote and starts its counts again", () => {
		const edges = run(LEVELED).flat?.edges ?? [];
		const next = edges.find((edge) => edge.outcome === NEXT_CHILD);
		expect(next?.bound).toEqual({ counter: `epic/build.${NEXT_CHILD}`, kind: "each" });
		expect(next?.clears).toEqual(["spec@task", "verdict@task", "change@task"]);
		expect(next?.resets).toEqual(["task/verify.fail"]);
		const entering = edges.filter(
			(edge) => edge.to === "epic/build" && edge.from.startsWith("epic/"),
		);
		expect(entering.map((edge) => [arrow(edge), edge.resets])).toEqual([
			["epic/decompose -(done)-> epic/build", [`epic/build.${NEXT_CHILD}`]],
			["epic/verify -(fail)-> epic/build", [`epic/build.${NEXT_CHILD}`]],
		]);
		const released = edges.filter((edge) => edge.from === "epic/build.child-escalated");
		expect(released.map((edge) => edge.releases)).toEqual([["task@task"], ["task@task"]]);
	});

	test("`at.<level>: false` leaves a step out like `only` does", () => {
		const doc = edit(LEVELED, { decompose: { only: undefined, at: { task: false } } });
		expect(found(doc)).toEqual([]);
		expect(run(doc).flat?.nodes.has("task/decompose")).toBe(false);
	});

	test("a child cannot read what a sibling wrote", () => {
		const doc = edit(LEVELED, { define: { at: { task: { reads: ["parent:tasks", "verdict"] } } } });
		const finding = one(found(doc), "read-before-write");
		expect(finding.message).toBe(
			"task/define reads `verdict@task`, which is not written on this path",
		);
		expect(finding.trace).toEqual([
			"epic/define -(done)-> epic/decompose",
			"epic/decompose -(done)-> epic/build",
			`epic/build -(${NEXT_CHILD})-> task/define`,
		]);
	});

	test("a child reads what its parent wrote for it", () => {
		const doc = edit(
			LEVELED,
			{
				decompose: { writes: ["tasks", "child:brief"] },
				define: { at: { task: { reads: ["parent:tasks", "brief"] } } },
			},
			{
				artifacts: { ...(LEVELED.artifacts as object), brief: "request" },
				files: { ...(LEVELED.files as object), brief: "notes/tasks/brief.md" },
			},
		);
		expect(found(doc)).toEqual([]);
		expect(run(doc).flat?.nodes.get("task/define")?.reads[1]?.artifact).toBe("brief@task");
	});

	test("an artifact of each level needs a place at each level", () => {
		const files = (spec: unknown) =>
			all({ ...LEVELED, files: { ...(LEVELED.files as object), spec } });
		expect(files({ epic: "notes/spec.md" })).toEqual([
			["no-path", "`spec@task` is written by task/define, and `files` gives it no place"],
		]);
		expect(files("notes/spec.md")).toEqual([]);
		expect(files({ epic: "notes/spec.md", saga: "notes/saga.md" })).toEqual([
			["invalid", "files.spec: unknown level `saga`"],
		]);
		expect(files({ epic: "notes/spec.md", task: 3 })).toEqual([
			["invalid", "files.spec.task: must be a path"],
		]);
	});

	test("a child that ends another way must be routed by the parent", () => {
		const doc = edit(LEVELED, { build: { children: { done: "verify" } } });
		expect(all(doc)).toEqual([
			[
				"unrouted-outcome",
				"a child of epic/build can end `escalated`, and `children.escalated` does not say where that leads",
			],
			["dead-end", "epic/build.child-escalated has no outcome, so the run stops there"],
		]);
	});

	test("the parent must say where it goes when every child is done", () => {
		const doc = edit(LEVELED, {
			build: { children: { escalated: { to: "decompose", max: 2, then: "escalated" } } },
		});
		expect(all(doc)).toEqual([["invalid", "epic/build: `children.done` is missing"]]);
	});

	test("levels need one step that runs the level below", () => {
		expect(all(edit(LEVELED, { build: { children: undefined } }))).toEqual([
			["invalid", "the flow has levels but no step has `children`"],
		]);
		expect(all(edit(LEVELED, { verify: { children: { done: "done" } } }))).toEqual([
			["invalid", "more than one step has `children`; one step runs the flow one level down"],
		]);
		expect(said({ ...LEVELED, levels: [] }, "invalid")).toContain(
			"`levels` must list at least one level",
		);
	});

	test("replanning with no bound sets the children's count back for ever", () => {
		const doc = edit(LEVELED, {
			build: {
				children: { done: "verify", escalated: { to: "decompose", releases: ["child:task"] } },
			},
		});
		const finding = one(found(doc), "bounds-reset");
		expect(finding.message).toContain(
			`epic/build.${NEXT_CHILD} is bounded, but epic/decompose.done sets its count back`,
		);
	});

	test("a name that points above the first level or below the last", () => {
		expect(all(edit(LEVELED, { define: { reads: ["parent:tasks"], at: {} } }))).toEqual([
			["invalid", "epic/define: `parent:tasks` points outside the levels"],
		]);
		expect(
			all(edit(LEVELED, { verify: { claims: ["child:task"], at: { epic: { claims: [] } } } })),
		).toEqual([["invalid", "task/verify: `child:task` points outside the levels"]]);
	});

	test("what the user provides and what is kept between runs belong to no level", () => {
		const doc = edit(LEVELED, {
			define: {
				at: {
					task: { reads: ["parent:tasks", "request", { artifact: "learnings", optional: true }] },
				},
			},
		});
		const { flat, findings } = run(doc);
		expect(findings).toEqual([]);
		expect(flat?.nodes.get("task/define")?.reads.map((read) => read.artifact)).toEqual([
			"tasks@epic",
			"request",
			"learnings",
		]);
	});

	test("`only` and `at` name levels of the flow", () => {
		expect(all(edit(LEVELED, { decompose: { only: ["saga"] } }))).toEqual([
			["invalid", "step `decompose`: `only` names unknown level `saga`"],
		]);
		expect(all(edit(LEVELED, { define: { at: { saga: {} } } }))).toEqual([
			["invalid", "step `define`: `at` names unknown level `saga`"],
		]);
		expect(all(edit(LEVELED, { define: { at: { task: "no" } } }))).toEqual([
			["invalid", "step `define`: `at.task` must be a mapping or false"],
		]);
		expect(
			all(edit(LEVELED, { define: { at: { task: { only: ["task"], prompt: "x" } } } })),
		).toEqual([
			["invalid", "step `define`: `at.task` cannot set `only`"],
			["invalid", "step `define`: `at.task` cannot set `prompt`"],
		]);
	});

	test("a step left out at a level is passed through by its first outcome", () => {
		expect(all(edit(LEVELED, { decompose: { outcomes: {} } }))).toEqual([
			[
				"invalid",
				"task/define.done: step `decompose` is skipped at level `task` and has no outcome to pass through",
			],
		]);
		const doc = edit(LEVELED, {
			decompose: { outcomes: { done: "order" } },
			order: { only: ["epic"], outcomes: { done: "decompose" } },
		});
		expect(said(doc, "invalid")).toEqual([
			"task/define.done: the steps skipped at level `task` lead back to `decompose`",
		]);
	});

	test("a level can be run inside another block", () => {
		expect(run({ ...LEVELED, inside: { task: "runner" } }).flat?.inside).toEqual(
			new Map([["task", "runner"]]),
		);
		expect(all({ ...LEVELED, inside: { epic: "runner" } })).toEqual([
			["invalid", "inside: `epic` is not a level below the outermost"],
		]);
		expect(all({ ...LEVELED, inside: { task: 3 } })).toEqual([
			["invalid", "inside.task: must name a block"],
		]);
		expect(all({ ...LEVELED, inside: { task: "ghost" } })).toEqual([
			["unknown-block", "inside.task: `ghost` is not listed under `blocks`"],
		]);
		expect(all({ ...BASE, inside: { task: "runner" } })).toEqual([
			["invalid", "inside: `task` is not a level below the outermost"],
		]);
	});

	test("three levels descend twice, and a child's other end climbs one level at a time", () => {
		const { flat } = loadFlow(
			"ship",
			{ ...LEVELED, levels: ["epic", "story", "task"] },
			{ blocks: BLOCKS, crossRun: CROSS },
		);
		const edges = flat?.edges.map(arrow) ?? [];
		expect(flat?.nodes.get("story/build")?.descends).toBe(true);
		expect(flat?.nodes.get("task/build")?.descends).toBe(false);
		expect(edges).toContain(`story/build -(${NEXT_CHILD})-> task/define`);
		expect(edges).toContain("task/verify -(pass)-> story/build");
		expect(edges).toContain("task/verify -(fail)-> story/build.child-escalated");
		expect(edges).toContain("story/build.child-escalated -(escalated)-> story/build");
		expect(edges).toContain(
			"story/build.child-escalated -(escalated)-> epic/build.child-escalated",
		);
		expect(edges).toContain("story/verify -(pass)-> epic/build");
	});
});
