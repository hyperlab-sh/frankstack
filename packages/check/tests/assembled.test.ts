import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkAssembled, duplicateKeys } from "../src/assembled.ts";
import { loadBundle } from "../src/bundle.ts";
import type { Finding } from "../src/types.ts";
import {
	ASSEMBLY,
	assembly,
	BLOCKS,
	BUNDLE,
	block,
	bundle,
	errorsOf,
	listing,
	remade,
	swap,
	temp,
	write,
} from "./fixture.ts";

const PLAN = "skills/plan/SKILL.md";
const EXECUTE = "skills/execute/SKILL.md";
const TASKS = "skills/tasks/SKILL.md";
const REVIEW = "agents/review.md";
const ROUTER = "playbooks/router.md";
const LEAD = "skills/lead/SKILL.md";

type Over = Record<string, string | undefined>;
type From = {
	yaml?: string;
	blocks?: Record<string, Record<string, string> | undefined>;
	catalog?: string;
};

/** Checks the careful assembly, with some files changed, against the sound bundle or a variant. */
function check(over: Over = {}, from: From = {}): Finding[] {
	const dir = bundle({ yaml: from.yaml, blocks: from.blocks });
	const { bundle: loaded, findings } = loadBundle(dir);
	expect(errorsOf(findings)).toEqual([]);
	if (!loaded) throw new Error("the bundle did not load");
	return checkAssembled(assembly(over), loaded, dir, from.catalog);
}
const all = (findings: Finding[]) => findings.map((finding) => [finding.rule, finding.message]);
const said = (findings: Finding[], rule: string) =>
	findings.filter((finding) => finding.rule === rule).map((finding) => finding.message);
/** A file of the careful assembly. */
const file = (path: string) => ASSEMBLY[path] ?? "";
/** A file of a block as the bundle holds it, marks and header included. */
const marked = (name: string, path: string) => BLOCKS[name]?.[path] ?? "";
const lineOf = (text: string, needle: string) => {
	const at = text.indexOf(needle);
	expect(at).toBeGreaterThanOrEqual(0);
	return text.slice(0, at).split("\n").length;
};
const entry = (path: string, value: unknown) =>
	check({ "assembly.json": listing({ [path]: value }) });
/** Where a mark of the plan block is, as the checker names it. */
const inPlan = (tag: string, needle: string) =>
	`\`${PLAN}\`: \`fs:${tag}\` at \`blocks/plan/SKILL.md\` line ${lineOf(marked("plan", "SKILL.md"), needle)}`;
const inExecute = (tag: string, needle: string) =>
	`\`${EXECUTE}\`: \`fs:${tag}\` at \`blocks/execute/SKILL.md\` line ${lineOf(marked("execute", "SKILL.md"), needle)}`;

const CREATE = "Add each task with `tk add`, as the `demo:tasks` skill describes.";
const CREATE_WAS = "Write each task as a `- [ ]` entry with the files it touches.";
const REPORT = "End with the line `OUTCOME: {outcome}`.";

describe("a careful assembly", () => {
	test("has no finding", () => {
		expect(check()).toEqual([]);
	});

	test("may reflow the text and add its own", () => {
		expect(
			check({
				[TASKS]: swap(file(TASKS), "Keep every piece of work", "Keep  every\npiece of\twork"),
			}),
		).toEqual([]);
		expect(check({ [TASKS]: `${file(TASKS)}\n## Notes\n\nAdded by the assembler.\n` })).toEqual([]);
	});
});

describe("tags left behind", () => {
	test("a tag in a written file", () => {
		const text = swap(
			file(PLAN),
			"every ticket small",
			'every <fs:concept name="Task">ticket</fs:concept> small',
		);
		expect(all(check({ [PLAN]: text }))).toEqual([
			[
				"leftover-tag",
				`\`${PLAN}\` line ${lineOf(text, "<fs:concept")}: a \`fs:\` tag was left in the text`,
			],
		]);
	});

	test("every line with a tag is named", () => {
		const text = `${file(LEAD)}<fs:part name="x">\nmore\n</fs:part>\n`;
		const open = lineOf(text, "<fs:part");
		expect(all(check({ [LEAD]: text }))).toEqual([
			["leftover-tag", `\`${LEAD}\` line ${open}, ${open + 2}: a \`fs:\` tag was left in the text`],
		]);
	});

	test("the report may speak of tags", () => {
		expect(
			check({ "ASSEMBLY-REPORT.md": "# Report\n\nThe `<fs:ref>` marks of plan were replaced.\n" }),
		).toEqual([]);
	});
});

describe("what the assembler writes besides the blocks", () => {
	test("the report", () => {
		expect(all(check({ "ASSEMBLY-REPORT.md": undefined }))).toEqual([
			["missing-file", "`ASSEMBLY-REPORT.md` is missing"],
		]);
	});

	test("the licences of the bundle", () => {
		expect(all(check({ "LICENSES/alpha/LICENSE": undefined }))).toEqual([
			["missing-file", "`LICENSES/alpha/LICENSE` is missing: the licences go with the blocks"],
		]);
	});

	test("the plugin's manifest", () => {
		const message = "`.claude-plugin/plugin.json` is missing or has no `name`";
		for (const manifest of [undefined, "{}", "{", '{ "name": 3 }'])
			expect(all(check({ ".claude-plugin/plugin.json": manifest }))).toEqual([
				["missing-file", message],
			]);
	});

	test("a file nothing accounts for is a warning", () => {
		expect(check({ "notes/README.md": "Notes.\n" })).toEqual([
			{
				rule: "unlisted-file",
				severity: "warning",
				message: "`notes/README.md` is not listed in `assembly.json`",
			},
		]);
		expect(check({ "hooks/hooks.json": "{}\n" })).toEqual([]);
	});
});

describe("assembly.json", () => {
	test("missing or not JSON: nothing can be told to come from a block", () => {
		for (const json of [undefined, "{"]) {
			const findings = check({ "assembly.json": json });
			expect(said(findings, "missing-file")).toEqual([
				"`assembly.json` is missing or not valid JSON",
			]);
			expect(said(findings, "not-written")).toEqual([
				"`SKILL.md` of block `plan` was not written",
				"`template.md` of block `plan` was not written",
				"`SKILL.md` of block `execute` was not written",
				"`SKILL.md` of block `tasks` was not written",
				"`review.md` of block `review` was not written",
				"`PLAYBOOK.md` of block `router` was not written",
				"the lead `lead` was not written",
			]);
			expect(said(findings, "unlisted-file")).toHaveLength(7);
		}
	});

	test("without `files`", () => {
		for (const json of ["{}", '{ "files": [] }', "[]"])
			expect(said(check({ "assembly.json": json }), "invalid")).toEqual([
				"`assembly.json` needs `files`: each file written, with its block",
			]);
	});

	test("an entry of the wrong shape", () => {
		const message = `\`assembly.json\`: \`${TASKS}\` needs \`block\`, and either \`file\` (the file of the block it came from) or \`origin\` (\`created\` or \`lead\`)`;
		for (const value of [
			"tasks",
			{ block: "tasks" },
			{ file: "SKILL.md" },
			{ block: "tasks", file: "SKILL.md", origin: "created" },
			{ block: "tasks", origin: "copied" },
			{ block: 3, file: "SKILL.md" },
		]) {
			const findings = entry(TASKS, value);
			expect(said(findings, "invalid")).toEqual([message]);
			expect(said(findings, "not-written")).toEqual([
				"`SKILL.md` of block `tasks` was not written",
			]);
		}
	});

	test("a file it lists that is not there", () => {
		expect(all(entry("skills/ghost/SKILL.md", { block: "plan", file: "SKILL.md" }))).toEqual([
			[
				"missing-file",
				"`assembly.json` lists `skills/ghost/SKILL.md`, which is not in the assembly",
			],
		]);
	});

	test("a block the bundle does not have", () => {
		expect(all(entry(TASKS, { block: "tickets", file: "SKILL.md" }))).toEqual([
			[
				"unknown-block",
				`\`assembly.json\`: \`${TASKS}\` names block \`tickets\`, which the bundle does not have`,
			],
			["not-written", "`SKILL.md` of block `tasks` was not written"],
		]);
	});

	test("an origin that is not the block's", () => {
		const lead = ["not-written", "the lead `lead` was not written"];
		const tasks = ["not-written", "`SKILL.md` of block `tasks` was not written"];
		expect(all(entry(LEAD, { block: "lead", origin: "created" }))).toEqual([
			[
				"invalid",
				`\`assembly.json\`: \`${LEAD}\` is given as \`origin: created\`, and block \`lead\` is \`lead\``,
			],
			lead,
		]);
		expect(all(entry(LEAD, { block: "lead", file: "SKILL.md" }))).toEqual([
			[
				"invalid",
				`\`assembly.json\`: \`${LEAD}\` is given as written from a file, and block \`lead\` is \`lead\``,
			],
			lead,
		]);
		expect(all(entry(TASKS, { block: "tasks", origin: "created" }))).toEqual([
			[
				"invalid",
				`\`assembly.json\`: \`${TASKS}\` is given as \`origin: created\`, and block \`tasks\` is a block with files: name the file it came from`,
			],
			tasks,
		]);
		expect(all(entry(TASKS, { block: "tasks", file: "README.md" }))).toEqual([
			[
				"invalid",
				`\`assembly.json\`: \`${TASKS}\` came from \`README.md\`, which is not a file of block \`tasks\``,
			],
			tasks,
		]);
	});

	test("a file of a block that was not written", () => {
		const over = {
			"skills/plan/template.md": undefined,
			"assembly.json": listing({ "skills/plan/template.md": undefined }),
		};
		expect(all(check(over))).toEqual([
			["not-written", "`template.md` of block `plan` was not written"],
		]);
	});

	test("the lead that was not written", () => {
		const over = { [LEAD]: undefined, "assembly.json": listing({ [LEAD]: undefined }) };
		expect(all(check(over))).toEqual([["not-written", "the lead `lead` was not written"]]);
	});

	test("a created block is written from its description", () => {
		const yaml = swap(
			BUNDLE,
			"  lead:\n    origin: created",
			"  helper: { origin: created, kind: skill, does: Helps the lead. }\n  lead:\n    origin: created",
		);
		expect(all(check({}, { yaml }))).toEqual([
			["not-written", "the created block `helper` was not written"],
		]);
		const helper = "skills/helper/SKILL.md";
		const over = {
			[helper]: "---\nname: helper\ndescription: Use to help the lead\n---\n\nHelp.\n",
			"assembly.json": listing({ [helper]: { block: "helper", origin: "created" } }),
		};
		expect(check(over, { yaml })).toEqual([]);
		over["assembly.json"] = listing({ [helper]: { block: "helper", origin: "lead" } });
		expect(said(check(over, { yaml }), "invalid")).toEqual([
			`\`assembly.json\`: \`${helper}\` is given as \`origin: lead\`, and block \`helper\` is \`created\``,
		]);
	});
});

describe("frontmatter of skills and agents", () => {
	const lead = (front: string) =>
		all(
			check({ [LEAD]: `${front}\nStart \`demo:plan\`, read its outcome, and follow the flow.\n` }),
		);

	test("needs a name and a description", () => {
		const message = `\`${LEAD}\` needs frontmatter with \`name\` and \`description\``;
		for (const front of [
			"",
			"---\nname: lead\n---\n",
			"---\ndescription: Leads.\n---\n",
			'---\nname: lead\ndescription: ""\n---\n',
			"---\nname: [lead\ndescription: Leads.\n---\n",
			"---\n- lead\n---\n",
		])
			expect(lead(front)).toEqual([["bad-frontmatter", message]]);
	});

	test("a key given twice", () => {
		expect(lead("---\nname: lead\ndescription: Leads.\nname: lead\n---\n")).toEqual([
			["bad-frontmatter", `\`${LEAD}\` gives \`name\` twice in its frontmatter`],
		]);
	});

	test("a name that is not the folder's", () => {
		expect(lead("---\nname: boss\ndescription: Leads.\n---\n")).toEqual([
			["bad-frontmatter", `\`${LEAD}\` is named \`boss\` in its frontmatter`],
		]);
	});

	test("a name that is not the block's", () => {
		expect(all(check({ [PLAN]: swap(file(PLAN), "name: plan\n", "name: planner\n") }))).toEqual([
			["bad-frontmatter", `\`${PLAN}\` is named \`planner\` in its frontmatter`],
			[
				"bad-frontmatter",
				`\`${PLAN}\` is the main file of block \`plan\`, and its frontmatter names it \`planner\``,
			],
		]);
		expect(
			all(check({ [REVIEW]: swap(file(REVIEW), "name: review\n", "name: reviewer\n") })),
		).toEqual([
			["bad-frontmatter", `\`${REVIEW}\` is named \`reviewer\` in its frontmatter`],
			[
				"bad-frontmatter",
				`\`${REVIEW}\` is the main file of block \`review\`, and its frontmatter names it \`reviewer\``,
			],
		]);
	});

	test("two skills with one name", () => {
		const copy = "skills/plan2/SKILL.md";
		expect(all(check({ [copy]: "---\nname: plan\ndescription: A copy.\n---\n\nCopy.\n" }))).toEqual(
			[
				["unlisted-file", `\`${copy}\` is not listed in \`assembly.json\``],
				["bad-frontmatter", `\`${copy}\` is named \`plan\` in its frontmatter`],
				["bad-frontmatter", `\`${copy}\` and \`${PLAN}\` are both the skill \`plan\``],
			],
		);
	});

	test("a skill and an agent may share a name", () => {
		const findings = check({
			"agents/plan.md": "---\nname: plan\ndescription: An agent.\n---\n\nPlan.\n",
		});
		expect(all(findings)).toEqual([
			["unlisted-file", "`agents/plan.md` is not listed in `assembly.json`"],
		]);
	});

	test("keys written twice are found in the frontmatter only", () => {
		expect(duplicateKeys("---\nname: a\ndescription: b\nname: c\n---\nname: d\n")).toEqual([
			"name",
		]);
		expect(duplicateKeys("---\nname: a\nmeta:\n  name: b\n---\n")).toEqual([]);
		expect(duplicateKeys("name: a\nname: b\n")).toEqual([]);
		expect(duplicateKeys("---\r\nname: a\r\nname: b\r\n---\r\n")).toEqual(["name"]);
	});
});

describe("names that lead nowhere", () => {
	test("a name of this plugin that is no block", () => {
		const text = swap(file(LEAD), "demo:plan", "demo:planner");
		expect(all(check({ [LEAD]: text }))).toEqual([
			[
				"unresolved-name",
				`\`${LEAD}\` line ${lineOf(text, "demo:planner")}: \`demo:planner\` is no block of this bundle`,
			],
		]);
	});

	test("other plugins' names, paths and addresses are left alone", () => {
		const text = `${file(LEAD)}\nSee \`other:thing\`, demo:notes/plan.md and http://demo:8080/demo:x.\n`;
		expect(check({ [LEAD]: text })).toEqual([]);
	});
});

describe("text no mark covers", () => {
	const where = (needle: string) =>
		`\`${EXECUTE}\`: text of \`blocks/execute/SKILL.md\` line ${lineOf(marked("execute", "SKILL.md"), needle)} that no mark covers was changed, moved or removed`;

	test("changed", () => {
		const text = swap(file(EXECUTE), "Commit after every step.", "Commit when the work is done.");
		expect(all(check({ [EXECUTE]: text }))).toEqual([
			["changed-text", `${where("Commit after every step.")}: "Commit after every step."`],
		]);
	});

	test("moved", () => {
		const text = swap(
			swap(file(EXECUTE), "\nCommit after every step.\n", "\n"),
			"# Execute\n",
			"Commit after every step.\n\n# Execute\n",
		);
		expect(all(check({ [EXECUTE]: text }))).toEqual([
			["changed-text", `${where("Commit after every step.")}: "Commit after every step."`],
		]);
	});

	test("a file rewritten whole is reported in a few lines", () => {
		const text =
			"---\nname: plan\ndescription: Use when a design is approved and the work needs a plan\n---\n\nNothing of the original.\n";
		const changed = said(check({ [PLAN]: text }), "changed-text");
		expect(changed).toHaveLength(6);
		expect(changed[0]).toBe(
			`\`${PLAN}\`: text of \`blocks/plan/SKILL.md\` line ${lineOf(marked("plan", "SKILL.md"), "# Plan")} that no mark covers was changed, moved or removed: "# Plan"`,
		);
		expect(changed[5]).toBe(
			`\`${PLAN}\`: 4 more passages of \`blocks/plan/SKILL.md\` were changed, moved or removed`,
		);
	});

	test("a long passage is cut short in the message", () => {
		const passage = `${"word ".repeat(30).trim()}.`;
		const router = remade("router", { text: () => `# Routing\n\n${passage}\n` });
		const findings = check({ [ROUTER]: "# Routing\n\nSomething else.\n" }, { blocks: { router } });
		expect(all(findings)).toEqual([
			[
				"changed-text",
				`\`${ROUTER}\`: text of \`blocks/router/PLAYBOOK.md\` line ${lineOf(router["PLAYBOOK.md"] ?? "", passage)} that no mark covers was changed, moved or removed: "${passage.slice(0, 90)}…"`,
			],
		]);
	});

	test("the frontmatter is the target's to write", () => {
		const text = swap(
			file(TASKS),
			"description: Use to keep the work as tickets",
			"description: Use whenever work must be tracked",
		);
		expect(check({ [TASKS]: text })).toEqual([]);
	});
});

describe("what stands where a mark was", () => {
	test("a use of a concept is the provider's sentence", () => {
		expect(all(check({ [PLAN]: swap(file(PLAN), CREATE, CREATE_WAS) }))).toEqual([
			[
				"unhandled-mark",
				`${inPlan("uses", "<fs:uses")}: the passage should be the sentence of \`tasks\` for \`TaskStorage.create\`: "Add each task with \`tk add\`, as the \`{name}\` skill describes."`,
			],
		]);
	});

	test("the sentence beside the passage it replaces", () => {
		expect(all(check({ [PLAN]: swap(file(PLAN), CREATE, `${CREATE} ${CREATE_WAS}`) }))).toEqual([
			[
				"unhandled-mark",
				`${inPlan("uses", "<fs:uses")}: the passage was kept beside the sentence of \`tasks\` for \`TaskStorage.create\``,
			],
		]);
	});

	test("the sentence without the provider's name", () => {
		const text = swap(file(PLAN), "`demo:tasks` skill", "`demo:tickets` skill");
		expect(all(check({ [PLAN]: text }))).toEqual([
			[
				"unhandled-mark",
				`${inPlan("uses", "<fs:uses")}: the passage should be the sentence of \`tasks\` for \`TaskStorage.create\`, with the name \`tasks\``,
			],
			[
				"unresolved-name",
				`\`${PLAN}\` line ${lineOf(text, "demo:tickets")}: \`demo:tickets\` is no block of this bundle`,
			],
		]);
	});

	test("a passage whose provider has no sentence for it is the assembler's to write", () => {
		const plan = remade("plan", {
			text: (text) =>
				swap(
					text,
					"Keep every",
					'<fs:uses concept="TaskStorage" purpose="says where tasks live">Tasks live in the plan file.</fs:uses>\n\nKeep every',
				),
		});
		const written = (passage: string) =>
			check(
				{ [PLAN]: swap(file(PLAN), "Keep every", `${passage}Keep every`) },
				{ blocks: { plan } },
			);
		expect(written("Tickets live under `.tickets/`.\n\n")).toEqual([]);
		expect(written("Tasks live in the plan file.\n\n")).toEqual([]);
		expect(written("")).toEqual([]);
	});

	test("a word for a concept is the provider's word", () => {
		expect(
			all(check({ [PLAN]: swap(file(PLAN), "every ticket small", "every task small") })),
		).toEqual([
			[
				"unhandled-mark",
				`${inPlan("concept", "<fs:concept")}: the passage still says "task": \`tasks\` calls a Task "ticket"`,
			],
		]);
	});

	test("a provider with no word for a concept leaves the ordinary one", () => {
		const tasks = remade("tasks", {
			header: (header) => swap(header, "    names: { Task: ticket }\n", ""),
		});
		const text = swap(file(PLAN), "every ticket small", "every task small");
		expect(said(check({ [PLAN]: text }, { blocks: { tasks } }), "unhandled-mark")).toEqual([]);
	});

	test("the name of a referenced block is the name it is installed under", () => {
		const text = swap(file(PLAN), "use demo:execute instead", "use the other skill instead");
		expect(all(check({ [PLAN]: text }))).toEqual([
			[
				"unhandled-mark",
				`${inPlan("name", "<fs:name>")}: the passage should have the name of \`execute\`, which stands for \`alpha/execute\``,
			],
		]);
	});

	test("a block installed under another name", () => {
		const yaml = swap(
			swap(
				swap(
					BUNDLE,
					"references: { alpha/execute: execute }",
					"references: { alpha/execute: build }",
				),
				"  execute: { from: alpha/execute }\n",
				"  build: { from: alpha/execute }\n",
			),
			"        block: execute\n",
			"        block: build\n",
		);
		const from = { yaml, blocks: { execute: undefined, build: BLOCKS.execute } };
		const over = {
			[EXECUTE]: undefined,
			"skills/build/SKILL.md": swap(file(EXECUTE), "name: execute\n", "name: build\n"),
			"assembly.json": listing({
				[EXECUTE]: undefined,
				"skills/build/SKILL.md": { block: "build", file: "SKILL.md" },
			}),
		};
		expect(
			check({ ...over, [PLAN]: swap(file(PLAN), "demo:execute", "demo:build") }, from),
		).toEqual([]);
		expect(all(check(over, from))).toEqual([
			[
				"unhandled-mark",
				`${inPlan("name", "<fs:name>")}: the passage should have the name of \`build\`, which stands for \`alpha/execute\``,
			],
			[
				"unresolved-name",
				`\`${PLAN}\` line ${lineOf(file(PLAN), "demo:execute")}: \`demo:execute\` is no block of this bundle`,
			],
		]);
	});

	test("a reference bound to nothing takes its passage out", () => {
		const yaml = swap(
			BUNDLE,
			"references: { alpha/execute: execute }",
			"references: { alpha/execute: null }",
		);
		const without = swap(file(PLAN), "Without subagents, use demo:execute instead.\n\n", "");
		expect(check({ [PLAN]: without }, { yaml })).toEqual([]);
		const kept = swap(file(PLAN), "demo:execute", "execute");
		expect(all(check({ [PLAN]: kept }, { yaml }))).toEqual([
			[
				"unhandled-mark",
				`${inPlan("ref", "<fs:ref")}: the passage should have been taken out: the reference \`alpha/execute\` is bound to null`,
			],
		]);
	});

	describe("routes", () => {
		const cut = file(PLAN).slice(0, file(PLAN).indexOf("End with the line"));
		const route = inPlan("route", "<fs:route");

		test("a route is the sentence of the block that provides Routing", () => {
			expect(all(check({ [PLAN]: cut }))).toEqual([
				[
					"unhandled-mark",
					`${route}: the passage should be the sentence of \`router\` for reporting \`done\`: "${REPORT}"`,
				],
				[
					"missing-outcome",
					`block \`plan\` is used by plan and never says how to report an outcome (\`router\`: "${REPORT}")`,
				],
			]);
		});

		test("the sentence names the outcome", () => {
			expect(all(check({ [PLAN]: `${cut}End with the line \`OUTCOME: finished\`.\n` }))).toEqual([
				[
					"unhandled-mark",
					`${route}: the passage should be the sentence of \`router\` for reporting \`done\`, and never names the outcome`,
				],
			]);
		});

		test("the old way on kept beside the new one", () => {
			const text = swap(
				file(PLAN),
				"End with the line `OUTCOME: done`.\n",
				"Then use execute to carry out the plan.\n",
			);
			expect(all(check({ [PLAN]: text }))).toEqual([
				[
					"unhandled-mark",
					`${route}: the passage was kept beside the sentence of \`router\` for reporting \`done\``,
				],
			]);
		});
	});

	describe("artifacts", () => {
		const NOTES = "If there are review notes at docs/notes.md, fix those first.";

		test("the path is the place the flow gives", () => {
			const text = swap(file(PLAN), "notes/plan.md", "docs/plans/plan.md");
			expect(all(check({ [PLAN]: text }))).toEqual([
				[
					"unhandled-mark",
					`${inPlan("path", "<fs:path>docs/plans/plan.md")}: the passage should have the place of \`plan\``,
				],
			]);
		});

		test("a passage about an artifact no cell gives is taken out", () => {
			const text = swap(
				file(EXECUTE),
				"Commit after every step.",
				`${NOTES}\n\nCommit after every step.`,
			);
			expect(all(check({ [EXECUTE]: text }))).toEqual([
				[
					"unhandled-mark",
					`${inExecute("artifact", '<fs:artifact name="notes"')}: the passage should have been taken out: no cell gives an artifact for \`notes\``,
				],
			]);
		});

		test("a passage about an artifact a cell gives stays, with its place", () => {
			const yaml = swap(
				BUNDLE,
				"inputs: { plan: plan }\n        outputs: { change: change }\n        reads: [{ artifact: findings, optional: true }]",
				"inputs: { plan: plan, notes: findings }\n        outputs: { change: change }",
			);
			const stays = (passage: string) =>
				check(
					{
						[EXECUTE]: swap(
							file(EXECUTE),
							"Commit after every step.",
							`${passage}\n\nCommit after every step.`,
						),
					},
					{ yaml },
				);
			expect(stays(swap(NOTES, "docs/notes.md", "notes/findings.md"))).toEqual([]);
			expect(all(stays(NOTES))).toEqual([
				[
					"unhandled-mark",
					`${inExecute("path", "<fs:path>docs/notes.md")}: the passage should have the place of \`notes\``,
				],
			]);
			expect(said(check({}, { yaml }), "changed-text")).toHaveLength(2);
		});

		test("a block used by cells that keep an artifact in different places asks the lead", () => {
			const yaml = swap(
				swap(
					swap(BUNDLE, "plan: plan, change: change", "plan: plan, fixplan: plan, change: change"),
					"      plan: notes/plan.md\n",
					"      plan: notes/plan.md\n      fixplan: notes/fixplan.md\n",
				),
				"          fail: { to: build, max: 2, then: escalated }\n",
				`          fail: { to: replan, max: 2, then: escalated }
      replan:
        does: Plan the fixes.
        block: plan
        inputs: { design: design }
        outputs: { plan: fixplan }
        outcomes: { done: rebuild, blocked: escalated }
      rebuild:
        does: Build the fixes.
        block: execute
        inputs: { plan: fixplan }
        outputs: { change: change }
        outcomes: { done: review }
`,
			);
			const asks = "the place the lead gives for `plan`";
			const careful = {
				[PLAN]: swap(file(PLAN), "to notes/plan.md when", `to ${asks} when`),
				[EXECUTE]: swap(file(EXECUTE), "at notes/plan.md one", `at ${asks} one`),
			};
			expect(check(careful, { yaml })).toEqual([]);
			const problem = `the passage should have "${asks}": the cells keep it in different places`;
			expect(all(check({}, { yaml }))).toEqual([
				["unhandled-mark", `${inPlan("path", "<fs:path>docs/plans/plan.md")}: ${problem}`],
				["unhandled-mark", `${inExecute("path", "<fs:path>docs/plans/plan.md")}: ${problem}`],
			]);
		});
	});

	test("a block written for the provider the bundle keeps is left as it is", () => {
		const yaml = swap(
			swap(BUNDLE, "  TaskStorage: tasks\n", "  TaskStorage: { as-written: alpha }\n"),
			"  tasks: { from: beta/tasks }\n",
			"",
		);
		const from = { yaml, blocks: { tasks: undefined } };
		const over = { [TASKS]: undefined, "assembly.json": listing({ [TASKS]: undefined }) };
		const asWritten = {
			...over,
			[PLAN]: swap(swap(file(PLAN), CREATE, CREATE_WAS), "every ticket small", "every task small"),
			[EXECUTE]: swap(
				file(EXECUTE),
				"Close the ticket with `tk close <id>`.",
				"Tick the `- [ ]` box of a task when it is finished.",
			),
		};
		expect(check(asWritten, from)).toEqual([]);
		expect(said(check(over, from), "changed-text")).toEqual([
			`\`${PLAN}\`: text of \`blocks/plan/SKILL.md\` line ${lineOf(marked("plan", "SKILL.md"), "<fs:uses")} that no mark covers was changed, moved or removed: "${CREATE_WAS}"`,
			`\`${PLAN}\`: text of \`blocks/plan/SKILL.md\` line ${lineOf(marked("plan", "SKILL.md"), "Keep every")} that no mark covers was changed, moved or removed: "Keep every task small enough for one sitting."`,
			`\`${EXECUTE}\`: text of \`blocks/execute/SKILL.md\` line ${lineOf(marked("execute", "SKILL.md"), "<fs:uses")} that no mark covers was changed, moved or removed: "Tick the \`- [ ]\` box of a task when it is finished."`,
		]);
	});
});

describe("a block a cell uses says how to report its outcome", () => {
	const cut = file(REVIEW).slice(0, file(REVIEW).indexOf("\n## Outcomes"));
	const message = `block \`review\` is used by review and never says how to report an outcome (\`router\`: "${REPORT}")`;

	test("a block that never says it", () => {
		expect(all(check({ [REVIEW]: cut }))).toEqual([["missing-outcome", message]]);
	});

	test("without fingerprints, the sentence itself is looked for", () => {
		const router = remade("router", {
			header: (header) => swap(header, '    fingerprints: ["OUTCOME:"]\n', ""),
		});
		expect(check({}, { blocks: { router } })).toEqual([]);
		expect(all(check({ [REVIEW]: cut }, { blocks: { router } }))).toEqual([
			["missing-outcome", message],
		]);
	});

	test("a block with no outcome has nothing to report", () => {
		const review = remade("review", {
			header: (header) =>
				swap(
					header,
					"outcomes:\n  pass: Nothing blocks the change.\n  fail: Something must be fixed.\n",
					"",
				),
		});
		expect(said(check({ [REVIEW]: cut }, { blocks: { review } }), "missing-outcome")).toEqual([]);
	});
});

describe("what is left of a provider the bundle does not use", () => {
	const left = (path: string, line: number, betrays: string, provider: string): Finding => ({
		rule: "leftover-fingerprint",
		severity: "warning",
		message: `\`${path}\` line ${line}: \`${betrays}\` belongs to \`${provider}\`, which does not provide \`TaskStorage\` in this bundle (the import missed a mark, or a passage was kept)`,
	});

	describe("a provider in the bundle that was not chosen", () => {
		const BOARD = "skills/board/SKILL.md";
		const text =
			"---\nname: board\ndescription: Use to keep the work on a board\n---\n\nAdd a card with `bd add`.\n";
		const board = block(
			`kind: skill
does: Keeps tasks on a board.
provides:
  TaskStorage:
    verbs:
      create: "Add a card with \`bd add\`."
      mark-done: "Close the card with \`bd close\`."
    names: { Task: card }
    fingerprints: ["bd "]
`,
			{ "SKILL.md": text },
		);
		const from = {
			yaml: swap(
				BUNDLE,
				"  review: { origin: imported }\n",
				"  board: { origin: imported }\n  review: { origin: imported }\n",
			),
			blocks: { board },
		};
		const over = {
			[BOARD]: text,
			"assembly.json": listing({ [BOARD]: { block: "board", file: "SKILL.md" } }),
		};

		test("its own file may speak its own way", () => {
			expect(check(over, from)).toEqual([]);
		});

		test("another file that speaks its way is a warning", () => {
			const lead = `${file(LEAD)}\nRun \`bd ready\` to see what is next.\n`;
			expect(check({ ...over, [LEAD]: lead }, from)).toEqual([
				left(LEAD, lineOf(lead, "bd ready"), "bd ", "board"),
			]);
		});

		test("a longer word is not its way", () => {
			const lead = `${file(LEAD)}\nRun \`abd ready\` to see what is next.\n`;
			expect(check({ ...over, [LEAD]: lead }, from)).toEqual([]);
		});
	});

	describe("a provider that is not in the bundle", () => {
		const plan = remade("plan", {
			header: (header) =>
				swap(
					header,
					"written-for: alpha, verbs: [create]",
					"written-for: gamma/store, verbs: [create]",
				),
		});
		const store = block(
			`id: gamma/store
source: { repo: example/gamma, commit: "3333333", path: docs/tasks.md }
kind: playbook
does: Keeps tasks as boxes in the plan file.
provides:
  TaskStorage:
    verbs:
      create: "Write each task as a \`- [ ]\` entry."
    fingerprints: ["- [ ]"]
`,
			{ "tasks.md": "# Tasks\n\nA task is a `- [ ]` line of the plan.\n" },
		);

		test("without the catalog it cannot be looked for", () => {
			expect(check({}, { blocks: { plan } })).toEqual([
				{
					rule: "fingerprints-not-checked",
					severity: "warning",
					message:
						"the bundle replaces `gamma/store` for `TaskStorage`, which is not in the bundle: give `--catalog <folder>` to look for what is left of it",
				},
			]);
		});

		test("a catalog that does not have it", () => {
			const catalog = temp();
			expect(check({}, { blocks: { plan }, catalog })).toEqual([
				{
					rule: "fingerprints-not-checked",
					severity: "warning",
					message: `the bundle replaces \`gamma/store\` for \`TaskStorage\`, and \`${join(catalog, "gamma/store")}\` is not in the catalog`,
				},
			]);
		});

		test("with the catalog, what betrays it is looked for in every file", () => {
			const catalog = temp();
			write(join(catalog, "gamma/store"), store);
			expect(check({}, { blocks: { plan }, catalog })).toEqual([]);
			const text = `${file(EXECUTE)}\nTick the \`- [ ]\` box when a task is done.\n`;
			expect(check({ [EXECUTE]: text }, { blocks: { plan }, catalog })).toEqual([
				left(EXECUTE, lineOf(text, "- [ ]"), "- [ ]", "gamma/store"),
			]);
		});
	});
});
