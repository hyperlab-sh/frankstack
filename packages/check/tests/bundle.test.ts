import { describe, expect, test } from "bun:test";
import { idOf, keeps, loadBundle, repeated, usesOf } from "../src/bundle.ts";
import type { Finding } from "../src/types.ts";
import { BLOCKS, BUNDLE, block, bundle, one, remade, rules, swap, temp } from "./fixture.ts";

type Over = Parameters<typeof bundle>[0];
const load = (over?: Over) => loadBundle(bundle(over));
const found = (over?: Over) => load(over).findings;
const said = (findings: Finding[], rule: string) =>
	findings.filter((finding) => finding.rule === rule).map((finding) => finding.message);
/** The sound bundle with one piece of its yaml replaced. */
const yaml = (from: string, to: string) => ({ yaml: swap(BUNDLE, from, to) });

const HOOK = block("kind: hook\ndoes: Stops a risky command.", {
	"guard.sh": "#!/bin/sh\nexit 0\n",
});
const SMALL = `name: demo
description: Two blocks and no flow.
target: claude-code-plugin
blocks:
  tasks: { from: beta/tasks }
  review: { origin: imported }
`;
const small = { plan: undefined, execute: undefined, router: undefined };

describe("a sound bundle", () => {
	test("has no finding", () => {
		const { bundle: read, findings } = load();
		expect(findings).toEqual([]);
		expect(read?.name).toBe("demo");
		expect(read?.target).toBe("claude-code-plugin");
		expect([...(read?.blocks.keys() ?? [])]).toEqual([
			"plan",
			"execute",
			"tasks",
			"review",
			"router",
			"lead",
		]);
		expect(read?.blocks.get("plan")?.origin).toBe("catalog");
		expect(read?.blocks.get("review")?.origin).toBe("imported");
		expect(read?.blocks.get("lead")?.origin).toBe("created");
		expect(read?.blocks.get("lead")?.loaded).toBeUndefined();
		expect(read?.blocks.get("lead")?.def?.kind).toBe("skill");
		expect([...(read?.concepts ?? [])]).toEqual([
			["TaskStorage", { block: "tasks" }],
			["Routing", { block: "router" }],
		]);
		expect(read?.flows.map((flow) => flow.name)).toEqual(["ship"]);
	});

	test("with no flow needs no routing and no lead", () => {
		expect(found({ yaml: SMALL, blocks: small })).toEqual([]);
	});

	test("a text that passes control relies on routing, whatever its header says", () => {
		const read = load().bundle;
		const plan = read?.blocks.get("plan");
		expect(plan && [...usesOf(plan).keys()]).toEqual(["TaskStorage", "Routing"]);
		expect(plan && usesOf(plan).get("Routing")?.writtenFor).toBe("alpha");
		const execute = read?.blocks.get("execute");
		expect(execute && [...usesOf(execute).keys()]).toEqual(["TaskStorage"]);
	});

	test("keeps a text only when the provider it was written for is the one chosen", () => {
		const read = load().bundle;
		if (!read) throw new Error("no bundle");
		expect(keeps(read, "TaskStorage", "alpha")).toBe(false);
		expect(keeps(read, "TaskStorage", "beta/tasks")).toBe(true);
		expect(keeps(read, "TaskStorage", undefined)).toBe(false);
		expect(keeps(read, "Memory", "alpha")).toBe(true);
		const asWritten = load(yaml("TaskStorage: tasks", "TaskStorage: { as-written: alpha }")).bundle;
		expect(asWritten && keeps(asWritten, "TaskStorage", "alpha")).toBe(true);
	});

	test("keeps a text written for an imported provider that says which block it is", () => {
		const source = 'source: { repo: example/beta, commit: "2222222", path: skills/tasks }\n';
		const own = {
			...yaml("tasks: { from: beta/tasks }", "tasks: { origin: imported }"),
			blocks: { tasks: remade("tasks", { header: (header) => swap(header, source, "") }) },
		};
		const { bundle: read, findings } = load(own);
		expect(findings).toEqual([]);
		expect(read?.blocks.get("tasks")?.from).toBeUndefined();
		expect(read && idOf(read.blocks.get("tasks"))).toBe("beta/tasks");
		expect(read && keeps(read, "TaskStorage", "beta/tasks")).toBe(true);
		expect(read && keeps(read, "TaskStorage", "alpha")).toBe(false);
		// With no id, nothing can have been written for it.
		const nameless = load({
			...own,
			blocks: {
				tasks: remade("tasks", {
					header: (header) => swap(swap(header, source, ""), "id: beta/tasks\n", ""),
				}),
			},
		}).bundle;
		expect(nameless && idOf(nameless.blocks.get("tasks"))).toBeUndefined();
		expect(nameless && keeps(nameless, "TaskStorage", "beta/tasks")).toBe(false);
	});
});

describe("bundle.yaml itself", () => {
	test("is missing", () => {
		const { bundle: read, findings } = loadBundle(temp());
		expect(read).toBeUndefined();
		expect(findings.map((finding) => finding.message)).toEqual(["`bundle.yaml` is missing"]);
	});

	test("is not YAML, or not a mapping", () => {
		const broken = load({ yaml: "name: [demo\n" });
		expect(broken.bundle).toBeUndefined();
		expect(one(broken.findings, "invalid").message).toStartWith(
			"`bundle.yaml` is not valid YAML: ",
		);
		expect(found({ yaml: "- demo\n" }).map((finding) => finding.message)).toEqual([
			"`bundle.yaml` must be a mapping",
		]);
	});

	test("has a key the format does not have", () => {
		expect(said(found({ yaml: `${BUNDLE}stacks: {}\n` }), "invalid")).toEqual([
			"unknown key `stacks`",
		]);
	});

	test("has no name, description or target", () => {
		const head =
			"name: demo\ndescription: From a design to a reviewed change.\ntarget: claude-code-plugin\n";
		expect(found(yaml(head, "")).map((finding) => finding.message)).toEqual([
			"`name` is missing",
			"`description` is missing",
			"`target` is missing",
		]);
	});

	test("names a target that does not exist", () => {
		expect(found(yaml("target: claude-code-plugin", "target: cursor"))).toEqual([
			{
				rule: "invalid",
				severity: "error",
				message: "`target`: `cursor` is not a target (claude-code-plugin)",
			},
		]);
	});

	test("has no blocks", () => {
		const findings = found({
			yaml: "name: demo\ndescription: Nothing.\ntarget: claude-code-plugin\n",
		});
		expect(said(findings, "invalid")).toEqual(["`blocks` is missing or empty"]);
	});
});

describe("the blocks of a bundle", () => {
	test("a listed block with no folder", () => {
		const findings = found({ blocks: { review: undefined } });
		expect(said(findings, "no-folder")).toEqual(["block `review`: `blocks/review/` is missing"]);
	});

	test("a folder that belongs to no block", () => {
		expect(found({ blocks: { extra: BLOCKS.review } })).toEqual([
			{
				rule: "unlisted-folder",
				severity: "error",
				message: "`blocks/extra` belongs to no block of `bundle.yaml`",
			},
		]);
	});

	test("a folder for a block the assembler creates", () => {
		expect(found({ blocks: { lead: { "SKILL.md": "Lead.\n" } } }).map((f) => f.message)).toEqual([
			"block `lead`: `blocks/lead/` exists; the assembler creates this block, so the bundle holds no file of it",
		]);
	});

	test("a folder that holds another block than `from` says", () => {
		expect(found(yaml("execute: { from: alpha/execute }", "execute: { from: alpha/run }"))).toEqual(
			[
				{
					rule: "wrong-block",
					severity: "error",
					message:
						"block `execute`: `blocks/execute/` holds `alpha/execute`, and `from` says `alpha/run`",
				},
			],
		);
		expect(
			said(
				found(yaml("review: { origin: imported }", "review: { from: alpha/review }")),
				"wrong-block",
			),
		).toEqual([
			"block `review`: `blocks/review/` holds a block with no `id`, and `from` says `alpha/review`",
		]);
	});

	test("a block of a stack listed as imported", () => {
		expect(
			found(yaml("execute: { from: alpha/execute }", "execute: { origin: imported }")).map(
				(finding) => finding.message,
			),
		).toEqual([
			"block `execute`: an imported block has no `source` in its header: a block of the catalog is listed with `from`",
		]);
	});

	test("a block listed twice", () => {
		const findings = found(
			yaml(
				"  review: { origin: imported }\n",
				"  review: { from: alpha/review }\n  review: { origin: imported }\n",
			),
		);
		expect(findings).toEqual([
			{
				rule: "duplicate-block",
				severity: "error",
				message: "`blocks` lists `review` twice; a bundle has one block per name",
			},
		]);
	});

	test("what is wrong inside a block's folder is reported with the block's name", () => {
		const files = { ...BLOCKS.plan };
		files["SKILL.md"] = swap(files["SKILL.md"] ?? "", "one sitting", "two sittings");
		const finding = one(found({ blocks: { plan: files } }), "hash-mismatch");
		expect(finding.message).toStartWith("block `plan`: `SKILL.md` without its marks is not");
	});

	test("an entry that is not written as the format says", () => {
		expect(
			said(found(yaml("review: { origin: imported }", "review: imported")), "invalid"),
		).toEqual(["block `review`: must be a mapping"]);
		expect(
			said(
				found(yaml("tasks: { from: beta/tasks }", "tasks: { from: beta/tasks, version: 2 }")),
				"invalid",
			),
		).toEqual(["block `tasks`: unknown key `version`"]);
		expect(
			said(
				found(yaml("tasks: { from: beta/tasks }", "tasks: { from: beta/tasks, origin: imported }")),
				"invalid",
			),
		).toEqual([
			"block `tasks`: `from` and `origin` do not go together: `origin` is for a block with no `from`",
		]);
		expect(
			said(
				found(yaml("tasks: { from: beta/tasks }", "tasks: { from: beta/tasks, kind: skill }")),
				"invalid",
			),
		).toEqual([
			"block `tasks`: `kind` is for a created block; this block's definition is the header of its main file",
		]);
	});

	test("an entry with no `from` and no known `origin` is not a block of the bundle", () => {
		const findings = found(yaml("router: { origin: imported }", "router: { origin: vendored }"));
		expect(said(findings, "invalid")).toEqual([
			"block `router`: needs `from: <stack>/<block>`, or `origin: imported` or `created`",
		]);
		expect(said(findings, "unknown-block")).toEqual([
			"`concepts.Routing`: `router` is not listed under `blocks`",
		]);
		expect(said(findings, "unlisted-folder")).toEqual([
			"`blocks/router` belongs to no block of `bundle.yaml`",
		]);
	});

	describe("a created block", () => {
		const lead = "    kind: skill\n    does: Leads the ship flow.\n";

		test("declares no references", () => {
			expect(
				found(yaml(lead, `${lead}    references: { alpha/plan: plan }\n`)).map((f) => f.message),
			).toEqual(["block `lead`: a created block has no text yet, so it declares no `references`"]);
		});

		test("needs a kind and what it does", () => {
			expect(found(yaml(lead, "")).map((finding) => [finding.rule, finding.message])).toEqual([
				["invalid", "block `lead`: `kind` is missing"],
				["invalid", "block `lead`: `does` is missing"],
			]);
		});

		test("is defined in the terms of the language", () => {
			expect(
				found(yaml("    kind: skill\n    does: Leads", "    kind: wizard\n    does: Leads")).map(
					(f) => [f.rule, f.message],
				),
			).toEqual([["unknown-term", "block `lead`: `wizard` is not a block kind"]]);
		});

		test("can use and provide concepts like any block", () => {
			const store = `${lead}  store:\n    origin: created\n    kind: playbook\n    does: Keeps tasks in a file.\n    provides:\n      TaskStorage: { verbs: [create, mark-done], names: { Task: entry } }\n`;
			const read = load({
				yaml: swap(swap(BUNDLE, lead, store), "TaskStorage: tasks", "TaskStorage: store"),
			});
			expect(read.findings).toEqual([]);
			const provides = read.bundle?.blocks.get("store")?.def?.provides.get("TaskStorage");
			expect([...(provides?.verbs ?? [])]).toEqual([
				["create", undefined],
				["mark-done", undefined],
			]);
		});
	});
});

describe("references", () => {
	const bound = "    references: { alpha/execute: execute }\n";

	test("one the bundle does not bind", () => {
		expect(found(yaml(bound, ""))).toEqual([
			{
				rule: "unbound-reference",
				severity: "error",
				message:
					"block `plan`: its text names `alpha/execute`, and `references` has no entry for it",
			},
		]);
	});

	test("one bound to null is fine when the block can do without it", () => {
		expect(found(yaml(bound, "    references: { alpha/execute: null }\n"))).toEqual([]);
		expect(found(yaml(bound, "    references: { alpha/execute: ~ }\n"))).toEqual([]);
	});

	test("one bound to null that the block cannot do without", () => {
		const plan = remade("plan", {
			header: (header) => swap(header, "required: false", "required: true"),
		});
		expect(
			found({ ...yaml(bound, "    references: { alpha/execute: null }\n"), blocks: { plan } }).map(
				(finding) => [finding.rule, finding.message],
			),
		).toEqual([
			[
				"required-reference",
				"block `plan`: `alpha/execute` is bound to null, and the block cannot do without it",
			],
		]);
	});

	test("one bound to a block the bundle does not list", () => {
		expect(
			found(yaml(bound, "    references: { alpha/execute: runner }\n")).map((f) => [
				f.rule,
				f.message,
			]),
		).toEqual([
			[
				"unknown-block",
				"block `plan`: `references.alpha/execute` is `runner`, which is not listed under `blocks`",
			],
		]);
	});

	test("one bound to a block of another kind", () => {
		expect(
			found(yaml(bound, "    references: { alpha/execute: review }\n")).map((f) => [
				f.rule,
				f.message,
			]),
		).toEqual([
			[
				"wrong-kind",
				"block `plan`: `alpha/execute` is of kind `skill`, and `review` is of kind `agent`",
			],
		]);
	});

	test("one bound to a created block of the same kind", () => {
		expect(found(yaml(bound, "    references: { alpha/execute: lead }\n"))).toEqual([]);
	});

	test("an entry for a reference the block does not declare", () => {
		expect(
			found(yaml(bound, "    references: { alpha/execute: execute, alpha/other: review }\n")).map(
				(f) => [f.rule, f.message],
			),
		).toEqual([
			["invalid", "block `plan`: `references.alpha/other` is not a reference the block declares"],
		]);
	});

	test("entries of the wrong shape", () => {
		expect(found(yaml(bound, "    references: [execute]\n")).map((f) => f.message)).toEqual([
			"block `plan`: `references` must be a mapping",
			"block `plan`: its text names `alpha/execute`, and `references` has no entry for it",
		]);
		expect(
			found(yaml(bound, "    references: { alpha/execute: 3 }\n")).map((f) => f.message),
		).toEqual([
			"block `plan`: `references.alpha/execute` must be a block of this bundle, or null",
			"block `plan`: its text names `alpha/execute`, and `references` has no entry for it",
		]);
	});
});

describe("concepts", () => {
	test("a concept blocks use and the bundle does not settle", () => {
		expect(found(yaml("  TaskStorage: tasks\n", "")).map((f) => [f.rule, f.message])).toEqual([
			["no-provider", "block `plan` uses `TaskStorage`, and `concepts` has no entry for it"],
			["no-provider", "block `execute` uses `TaskStorage`, and `concepts` has no entry for it"],
		]);
	});

	test("a provider the bundle does not list", () => {
		expect(
			found(yaml("TaskStorage: tasks", "TaskStorage: tickets")).map((f) => [f.rule, f.message]),
		).toEqual([
			["unknown-block", "`concepts.TaskStorage`: `tickets` is not listed under `blocks`"],
		]);
	});

	test("a block that does not provide the concept", () => {
		expect(
			found(yaml("TaskStorage: tasks", "TaskStorage: review")).map((f) => [f.rule, f.message]),
		).toEqual([
			["not-a-provider", "`concepts.TaskStorage`: block `review` does not provide `TaskStorage`"],
		]);
	});

	test("a concept the language does not have, and the harness", () => {
		expect(
			found(
				yaml("  Routing: router\n", "  Routing: router\n  Storage: tasks\n  Harness: tasks\n"),
			).map((f) => [f.rule, f.message]),
		).toEqual([
			["unknown-term", "`concepts`: `Storage` is not a concept a block provides"],
			["invalid", "`concepts.Harness`: the target settles `Harness`; it has no entry"],
		]);
	});

	test("an entry of the wrong shape", () => {
		const message =
			"`concepts.TaskStorage` must be a block of this bundle or `{ as-written: <stack> }`";
		expect(said(found(yaml("TaskStorage: tasks", "TaskStorage: 3")), "invalid")).toEqual([message]);
		expect(
			said(
				found(yaml("TaskStorage: tasks", "TaskStorage: { as-written: alpha, also: beta }")),
				"invalid",
			),
		).toEqual([message]);
	});

	describe("as-written", () => {
		test("keeps the text of blocks written for that stack", () => {
			expect(found(yaml("TaskStorage: tasks", "TaskStorage: { as-written: alpha }"))).toEqual([]);
		});

		test("a block written for another stack", () => {
			expect(
				found(yaml("TaskStorage: tasks", "TaskStorage: { as-written: beta }")).map((f) => [
					f.rule,
					f.message,
				]),
			).toEqual([
				[
					"not-as-written",
					"`concepts.TaskStorage` is `as-written: beta`, and block `plan` was written for `alpha`",
				],
				[
					"not-as-written",
					"`concepts.TaskStorage` is `as-written: beta`, and block `execute` was written for `alpha`",
				],
			]);
		});

		test("a block whose header names no stack", () => {
			const execute = remade("execute", {
				header: (header) =>
					swap(header, "{ written-for: alpha, verbs: [mark-done] }", "{ verbs: [mark-done] }"),
			});
			expect(
				found({
					...yaml("TaskStorage: tasks", "TaskStorage: { as-written: alpha }"),
					blocks: { execute },
				}).map((f) => f.message),
			).toEqual([
				"`concepts.TaskStorage` is `as-written: alpha`, and block `execute` was written for no stack its header names",
			]);
		});

		test("a block the assembler writes has no text to keep", () => {
			const lead = "    does: Leads the ship flow.\n";
			const findings = found({
				yaml: swap(
					swap(BUNDLE, "TaskStorage: tasks", "TaskStorage: { as-written: alpha }"),
					lead,
					`${lead}    uses: { TaskStorage: { verbs: [list] } }\n`,
				),
			});
			expect(findings.map((f) => [f.rule, f.message])).toEqual([
				[
					"not-as-written",
					"`concepts.TaskStorage` is `as-written: alpha`, and block `lead` is written by the assembler, which has no block that says how `alpha` does it",
				],
			]);
		});
	});

	test("a verb the chosen provider has no sentence for", () => {
		const tasks = remade("tasks", {
			header: (header) =>
				swap(header, '      mark-done: "Close the ticket with `tk close <id>`."\n', ""),
		});
		expect(found({ blocks: { tasks } }).map((f) => [f.rule, f.message])).toEqual([
			[
				"missing-verb",
				"block `execute` does `TaskStorage.mark-done`, which `tasks` has no sentence for",
			],
		]);
	});

	test("a trait the chosen provider does not have", () => {
		const review = remade("review", {
			header: (header) => `${header}uses:\n  Decisions: { needs: [numbered] }\n`,
		});
		const provider = (traits: string) =>
			remade("router", {
				header: (header) =>
					swap(
						header,
						"provides:\n",
						`provides:\n  Decisions:\n    verbs: { read: "Read the log." }\n${traits}`,
					),
			});
		const chosen = yaml("  Routing: router\n", "  Routing: router\n  Decisions: router\n");
		expect(
			found({ ...chosen, blocks: { review, router: provider("") } }).map((f) => [
				f.rule,
				f.message,
			]),
		).toEqual([
			["missing-trait", "block `review` needs `Decisions.numbered`, which `router` does not have"],
		]);
		expect(
			found({ ...chosen, blocks: { review, router: provider("    traits: [numbered]\n") } }),
		).toEqual([]);
	});

	test("a trait of the harness the target does not have", () => {
		const review = remade("review", {
			header: (header) => `${header}uses:\n  Harness: { needs: [subagents] }\n`,
		});
		expect(found({ blocks: { review } })).toEqual([]);
		const findings = found({
			...yaml("target: claude-code-plugin", "target: cursor"),
			blocks: { review },
		});
		expect(said(findings, "missing-trait")).toEqual([
			"block `review` needs `Harness.subagents`, which the target `cursor` does not have",
		]);
	});

	test("a name the chosen provider does not give is a warning", () => {
		const tasks = remade("tasks", {
			header: (header) => swap(header, "    names: { Task: ticket }\n", ""),
		});
		expect(found({ blocks: { tasks } })).toEqual([
			{
				rule: "unnamed-concept",
				severity: "warning",
				message:
					"block `plan` names `Task`, and `tasks` gives no name for it: the assembler writes the ordinary word",
			},
		]);
	});
});

describe("routing", () => {
	test("a bundle with a flow and no provider of routing", () => {
		expect(found(yaml("  Routing: router\n", "")).map((f) => [f.rule, f.message])).toEqual([
			["no-provider", "block `plan` uses `Routing`, and `concepts` has no entry for it"],
			[
				"no-routing",
				"the bundle has a flow, and no block provides `Routing`: `concepts.Routing` must name the block that says how an outcome is reported",
			],
		]);
	});

	test("routing cannot stay as written when the bundle has a flow", () => {
		expect(rules(found(yaml("Routing: router", "Routing: { as-written: alpha }")))).toEqual([
			"no-routing",
		]);
	});

	test("routing can stay as written when the bundle has no flow", () => {
		const flows = BUNDLE.slice(BUNDLE.indexOf("flows:\n"));
		expect(
			found({
				yaml: swap(swap(BUNDLE, flows, ""), "Routing: router", "Routing: { as-written: alpha }"),
			}),
		).toEqual([]);
	});

	test("a provider of routing with no sentence for reporting", () => {
		const router = remade("router", {
			header: (header) =>
				swap(header, '    verbs:\n      report: "End with the line `OUTCOME: {outcome}`."\n', ""),
		});
		expect(found({ blocks: { router } }).map((f) => [f.rule, f.message])).toEqual([
			["missing-verb", "`router` provides `Routing` and has no sentence for `report`"],
		]);
	});
});

describe("hooks", () => {
	const hooks = (first: string, second: string) => ({
		...yaml(
			"  review: { origin: imported }\n",
			`  review: { origin: imported }\n  guard: ${first}\n  watch: ${second}\n`,
		),
		blocks: { guard: HOOK, watch: HOOK },
	});

	test("two hooks on different events", () => {
		expect(
			found(hooks("{ origin: imported, event: PreToolUse }", "{ origin: imported, event: Stop }")),
		).toEqual([]);
	});

	test("two hooks on one event", () => {
		expect(
			found(
				hooks("{ origin: imported, event: PreToolUse }", "{ origin: imported, event: PreToolUse }"),
			),
		).toEqual([
			{
				rule: "hook-clash",
				severity: "error",
				message: "guard and watch both hook the event `PreToolUse`",
			},
		]);
	});

	test("a hook with no event, or one that is not a name", () => {
		expect(
			found(hooks("{ origin: imported }", "{ origin: imported, event: [Stop] }")).map((f) => [
				f.rule,
				f.message,
			]),
		).toEqual([
			["invalid", "block `watch`: `event` must be the name of a hook event"],
			["invalid", "block `guard`: a hook needs `event`"],
			["invalid", "block `watch`: a hook needs `event`"],
		]);
	});

	test("an event on a block that is not a hook", () => {
		expect(
			found(yaml("review: { origin: imported }", "review: { origin: imported, event: Stop }")).map(
				(f) => f.message,
			),
		).toEqual(["block `review`: `event` is for a hook"]);
	});
});

describe("the flows of a bundle", () => {
	const ship = BUNDLE.slice(BUNDLE.indexOf("  ship:\n"));

	test("a lead that is not a created block", () => {
		expect(found(yaml("    lead: lead\n", "    lead: review\n"))).toEqual([
			{
				rule: "not-created",
				severity: "error",
				flow: "ship",
				message:
					"`lead` is `review`, which is not a created block; the assembler writes it from the flow",
			},
		]);
	});

	test("one block leading two flows", () => {
		expect(found({ yaml: BUNDLE + ship.replace("  ship:\n", "  again:\n") })).toEqual([
			{
				rule: "two-flows",
				severity: "error",
				message: "block `lead` leads the flows ship and again; a block leads one",
			},
		]);
	});

	test("each flow with its own lead", () => {
		const second =
			"  second:\n    origin: created\n    kind: skill\n    does: Leads the other flow.\n";
		const again = ship
			.replace("  ship:\n", "  again:\n")
			.replace("    lead: lead\n", "    lead: second\n");
		expect(found({ yaml: swap(BUNDLE, "flows:\n", `${second}flows:\n`) + again })).toEqual([]);
	});

	test("a flow listed twice", () => {
		expect(said(found({ yaml: BUNDLE + ship }), "invalid")).toEqual(["`flows` lists `ship` twice"]);
	});

	test("flows that are not a mapping", () => {
		const flows = BUNDLE.slice(BUNDLE.indexOf("flows:\n"));
		expect(found(yaml(flows, "flows: [ship]\n")).map((f) => f.message)).toEqual([
			"`flows` must be a mapping",
		]);
	});

	test("the findings of a flow carry its name", () => {
		const findings = found(yaml("        outcomes: { done: review }\n", ""));
		expect(findings.length).toBeGreaterThan(0);
		for (const finding of findings) expect(finding.flow).toBe("ship");
	});

	test("what the lead needs at a step is checked against the choices", () => {
		const step = "        reads: [{ artifact: findings, optional: true }]\n";
		const needs = (list: string) => found(yaml(step, `${step}        needs: [${list}]\n`));
		expect(needs("TaskStorage.create")).toEqual([]);
		expect(needs("TaskStorage.claim")).toEqual([
			{
				rule: "missing-verb",
				severity: "error",
				flow: "ship",
				message: "the lead at build does `TaskStorage.claim`, which `tasks` has no sentence for",
			},
		]);
		expect(needs("Memory.read").map((f) => [f.rule, f.message])).toEqual([
			["no-provider", "the lead at build uses `Memory`, and `concepts` has no entry for it"],
		]);
		expect(needs("Harness.subagents")).toEqual([]);
		expect(
			needs("TaskStorage, Memory.recall, Storage.read").map((f) => [f.rule, f.message]),
		).toEqual([
			[
				"unknown-term",
				"the lead at build needs `TaskStorage`: a need is written `<Concept>.<verb or trait>`",
			],
			[
				"unknown-term",
				"the lead at build needs `Memory.recall`: `Memory` has no verb or trait `recall`",
			],
			[
				"unknown-term",
				"the lead at build needs `Storage.read`: `Storage` is not a concept of the language",
			],
		]);
	});
});

describe("artifacts kept between runs", () => {
	const kept = (entry: string) => found({ yaml: `${BUNDLE}artifacts:\n  lessons: ${entry}\n` });

	test("need a kind and the scope", () => {
		const message = "artifacts.lessons: needs `kind` and `scope: cross-run`";
		expect(said(kept("{ kind: lessons }"), "invalid")).toEqual([message]);
		expect(said(kept("{ scope: cross-run }"), "invalid")).toEqual([message]);
		expect(said(kept("lessons"), "invalid")).toEqual([message]);
	});

	test("have a kind of the language", () => {
		expect(said(kept("{ kind: wisdom, scope: cross-run }"), "unknown-term")).toEqual([
			"artifacts.lessons: `wisdom` is not an artifact kind",
		]);
	});
});

describe("keys written twice", () => {
	test("are found directly under the section, whatever their quotes", () => {
		const text = [
			"blocks:",
			"  # a comment",
			"  plan: { from: a/plan }",
			'  "plan":',
			"    from: a/other",
			"",
			"  review: { origin: imported }",
			"  'review': { origin: imported }",
			"  a/b: 1",
			"  a/b: 2",
			"flows:",
			"  plan: {}",
		].join("\n");
		expect(repeated(text, "blocks")).toEqual(["plan", "review", "a/b"]);
		expect(repeated(text, "flows")).toEqual([]);
		expect(repeated(text, "concepts")).toEqual([]);
	});

	test("deeper keys of the same name are not counted", () => {
		const text = "blocks:\n  plan:\n    does: x\n  execute:\n    does: y\n    plan: z\n";
		expect(repeated(text, "blocks")).toEqual([]);
	});

	test("a section written on one line has nothing under it", () => {
		expect(repeated("blocks: { plan: {}, plan: {} }\n", "blocks")).toEqual([]);
	});
});
