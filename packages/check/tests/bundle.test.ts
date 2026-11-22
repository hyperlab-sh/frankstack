import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../src/analyze.ts";
import { checkAssembled } from "../src/assembled.ts";
import { capabilitiesOf, loadBundle } from "../src/bundle.ts";
import { loadStack } from "../src/load.ts";
import type { Finding } from "../src/types.ts";

const STACK = `
name: mini
start: plan
ends: [done, escalated]
inputs: [request]
components:
  TaskStorage: components/TaskStorage/tasks-md.md
blocks:
  home/lead: { kind: skill, as: loop, role: router }
  home/plan: { kind: skill, as: plan }
  away/review: { kind: agent, as: reviewer }
  away/brief: { kind: prompt, as: brief }
steps:
  plan:
    block: home/plan
    reads: [request]
    writes: [tasks]
    outcomes: { done: build }
  build:
    block: away/brief
    reads: [tasks]
    writes: [code]
    outcomes: { done: review }
  review:
    block: away/review
    reads: [code]
    outcomes:
      pass: done
      fail: { to: build, max: 2, then: escalated }
`;

const PLAN_SOURCE = [
	"---",
	"name: plan",
	"description: Plan the work",
	"---",
	"# Plan",
	"Read the request.",
	"Create one item per task with `bd create`.",
	"Report done.",
].join("\n");
const files: Record<string, string> = {
	"stack.yaml": STACK,
	"blocks/home/lead.md": "---\nname: lead\ndescription: Lead\n---\n# Lead\n",
	"blocks/home/plan.md": PLAN_SOURCE,
	"blocks/away/review.md": "# Review\nAnswer pass or fail.\n",
	"blocks/away/brief.md": "# Brief\nBuild it.\n",
	"annotations/home/lead.md":
		"---\nblock: home/lead\nkind: skill\nfiles: [blocks/home/lead.md]\noutcomes: []\n---\n",
	"annotations/home/plan.md": [
		"---",
		"block: home/plan",
		"kind: skill",
		"files: [blocks/home/plan.md]",
		"outcomes: [done]",
		"touches:",
		'  - { component: components/TaskStorage/beads.md, lines: "7", what: "Creates items: with bd." }',
		"---",
		"",
	].join("\n"),
	"annotations/away/review.md":
		"---\nblock: away/review\nkind: agent\nfiles: [blocks/away/review.md]\noutcomes: [pass, fail]\n---\n",
	"annotations/away/brief.md":
		"---\nblock: away/brief\nkind: prompt\nfiles: [blocks/away/brief.md]\noutcomes: [done]\n---\n",
	"components/TaskStorage/tasks-md.md": "---\ncapabilities: { claim: native }\n---\n",
	"components/TaskStorage/beads.md": '---\nfingerprints: ["bd create", ".beads"]\n---\n',
};

/** The plugin a careful assembler would write from the bundle above. */
const plugin: Record<string, string> = {
	".claude-plugin/plugin.json": JSON.stringify({ name: "mini", version: "0.1.0" }),
	"skills/loop/SKILL.md":
		"---\nname: loop\ndescription: Run the mini loop\n---\n# Loop\nSteps: plan, then the brief prompt at `$" +
		"{CLAUDE_PLUGIN_ROOT}/skills/loop/prompts/brief.md`, then the reviewer agent.\n",
	"skills/loop/prompts/brief.md": "# Brief\nBuild it.\nEnd with `OUTCOME: done`.\n",
	"skills/plan/SKILL.md": PLAN_SOURCE.replace(
		"Create one item per task with `bd create`.",
		"Add one `## T-n` section per task to tasks.md.",
	).replace("Report done.", "End with `OUTCOME: done`."),
	"agents/reviewer.md":
		"---\nname: reviewer\ndescription: Review the diff\n---\n# Review\nAnswer pass or fail.\nEnd with `OUTCOME: pass` or `OUTCOME: fail`.\n",
	"assembly.json": JSON.stringify({
		"skills/loop/SKILL.md": { block: "home/lead", source: "blocks/home/lead.md" },
		"skills/loop/prompts/brief.md": { block: "away/brief", source: "blocks/away/brief.md" },
		"skills/plan/SKILL.md": { block: "home/plan", source: "blocks/home/plan.md" },
		"agents/reviewer.md": { block: "away/review", source: "blocks/away/review.md" },
		".claude-plugin/plugin.json": "generated",
	}),
};

let root = "";
const write = async (dir: string, tree: Record<string, string>) => {
	for (const [path, text] of Object.entries(tree)) {
		await mkdir(join(dir, path, ".."), { recursive: true });
		await Bun.write(join(dir, path), text);
	}
	return dir;
};
let count = 0;
const bundleDir = (change: Record<string, string> = {}) =>
	write(join(root, `bundle-${count++}`), { ...files, ...change });
/** A plugin with some files changed; `null` leaves a file out. */
const pluginDir = (change: Record<string, string | null> = {}) => {
	const tree = Object.fromEntries(
		Object.entries({ ...plugin, ...change }).filter(
			(entry): entry is [string, string] => entry[1] !== null,
		),
	);
	return write(join(root, `plugin-${count++}`), tree);
};
const assembled = async (
	change: Record<string, string | null> = {},
	bundleChange: Record<string, string> = {},
): Promise<Finding[]> => {
	const bundle = await loadBundle(await bundleDir(bundleChange));
	const { flat } = loadStack(STACK);
	if (!flat) throw new Error("the fixture stack does not load");
	return checkAssembled(await pluginDir(change), flat, bundle);
};
const rulesOf = (findings: Finding[], severity = "error") =>
	findings.filter((f) => f.severity === severity).map((f) => f.rule);

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "frankstack-check-"));
});
afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("bundle", () => {
	test("a complete bundle loads and passes", async () => {
		const bundle = await loadBundle(await bundleDir());
		expect(bundle.findings).toEqual([]);
		expect([...bundle.annotations.keys()].sort()).toEqual([
			"away/brief",
			"away/review",
			"home/lead",
			"home/plan",
		]);
		const { flat, findings } = loadStack(STACK);
		expect(
			[...findings, ...(flat ? analyze(flat, bundle.annotations) : [])].filter(
				(f) => f.severity === "error",
			),
		).toEqual([]);
	});
	test("a key written twice in a frontmatter is an error", async () => {
		const bundle = await loadBundle(
			await bundleDir({
				"annotations/away/brief.md":
					'---\nblock: away/brief\nkind: prompt\nfiles: [blocks/away/brief.md]\noutcomes: [done]\nother:\n  - { lines: "1" }\nother:\n  - { lines: "2" }\n---\n',
			}),
		);
		expect(bundle.findings.map((f) => f.message)).toEqual([
			"annotations/away/brief.md: the key `other` is written twice",
		]);
	});
	test("a touch that names a card the bundle does not have", async () => {
		const bundle = await loadBundle(
			await bundleDir({
				"annotations/home/plan.md": (files["annotations/home/plan.md"] ?? "").replace(
					"components/TaskStorage/beads.md",
					"components/TaskStorage/linear.md",
				),
			}),
		);
		expect(bundle.findings.map((f) => f.message).join()).toContain(
			"card `components/TaskStorage/linear.md` is not in the bundle",
		);
	});
	test("the cards give the capabilities of the components", async () => {
		const bundle = await loadBundle(await bundleDir());
		expect(capabilitiesOf(bundle).get("components/TaskStorage/tasks-md.md")?.get("claim")).toBe(
			"native",
		);
		const bad = await loadBundle(
			await bundleDir({
				"components/TaskStorage/tasks-md.md": "---\ncapabilities: { claim: partly }\n---\n",
			}),
		);
		expect(bad.findings.map((f) => f.message).join()).toContain("`claim` must be native");
	});
	test("an annotation whose frontmatter is not YAML is reported with its file", async () => {
		const bundle = await loadBundle(
			await bundleDir({
				"annotations/away/brief.md": "---\nblock: away/brief\nwhat: a: b: c\n---\n",
			}),
		);
		expect(bundle.findings).toHaveLength(1);
		expect(bundle.findings[0]?.message).toContain("annotations/away/brief.md");
	});
	test("an annotation that names a source file the bundle does not have", async () => {
		const bundle = await loadBundle(
			await bundleDir({
				"annotations/away/brief.md":
					"---\nblock: away/brief\nkind: prompt\nfiles: [blocks/away/missing.md]\noutcomes: [done]\n---\n",
			}),
		);
		expect(bundle.findings.map((f) => f.message).join()).toContain("blocks/away/missing.md");
	});
	test("touch lines accept `n`, `n-m` and comma lists, and nothing else", async () => {
		const withLines = (lines: string) =>
			bundleDir({
				"annotations/home/plan.md": (files["annotations/home/plan.md"] ?? "").replace(
					'lines: "7"',
					`lines: "${lines}"`,
				),
			});
		for (const lines of ["7", "6-7", "2,6-7", "2, 7"])
			expect((await loadBundle(await withLines(lines))).findings).toEqual([]);
		for (const lines of ["seven", "7-", "7;8", ""])
			expect((await loadBundle(await withLines(lines))).findings).toHaveLength(1);
	});
});

describe("assembled plugin", () => {
	test("a faithful assembly passes", async () => {
		expect(await assembled()).toEqual([]);
	});
	test("a block that was never installed", async () => {
		expect(rulesOf(await assembled({ "agents/reviewer.md": null }))).toContain("missing-block");
	});
	test("a leftover of a component the stack does not use is an error", async () => {
		const findings = await assembled({
			"skills/plan/SKILL.md": (plugin["skills/plan/SKILL.md"] ?? "").replace(
				"Read the request.",
				"Read the request and run `bd create`.",
			),
		});
		const hit = findings.find((f) => f.rule === "leftover");
		expect(hit?.severity).toBe("error");
		expect(hit?.message).toContain("bd create");
	});
	test("a touch left as the source wrote it is the assembler's miss", async () => {
		const findings = await assembled({ "skills/plan/SKILL.md": PLAN_SOURCE });
		const hit = findings.find((f) => f.rule === "leftover");
		expect(hit?.severity).toBe("error");
		expect(hit?.message).toContain("line 7");
	});
	test("a leftover on a source line no touch covers is the annotation's miss: a warning", async () => {
		const extra = "\nNever commit the `.beads` folder.";
		const findings = await assembled(
			{ "skills/plan/SKILL.md": `${plugin["skills/plan/SKILL.md"]}${extra}` },
			{ "blocks/home/plan.md": `${PLAN_SOURCE}${extra}` },
		);
		expect(findings.filter((f) => f.severity === "error")).toEqual([]);
		const hit = findings.find((f) => f.rule === "leftover");
		expect(hit?.severity).toBe("warning");
		expect(hit?.message).toContain("line 9");
		expect(hit?.message).toContain("covered by no touch");
	});
	test("lines are traced back to the source across earlier additions and removals", async () => {
		// Two lines added above and one removed: the kept `.beads` line is still the source's line 9.
		const extra = "\nNever commit the `.beads` folder.";
		const rewritten = `${plugin["skills/plan/SKILL.md"]}${extra}`
			.replace("# Plan", "# Plan\nA note.\nAnother note.")
			.replace("Read the request.\n", "");
		const findings = await assembled(
			{ "skills/plan/SKILL.md": rewritten },
			{ "blocks/home/plan.md": `${PLAN_SOURCE}${extra}` },
		);
		expect(findings.filter((f) => f.rule === "leftover").map((f) => f.severity)).toEqual([
			"warning",
		]);
	});
	test("a reference to the home stack on a line the assembler wrote is an error", async () => {
		const findings = await assembled({
			"skills/loop/prompts/brief.md": `${plugin["skills/loop/prompts/brief.md"]}Then use away:review.\n`,
		});
		expect(findings.find((f) => f.rule === "home-reference")?.severity).toBe("error");
	});
	test("the same reference kept from the source is a warning", async () => {
		const findings = await assembled(
			{
				"skills/loop/prompts/brief.md":
					"# Brief\nBuild it.\nSee away:review.\nEnd with `OUTCOME: done`.\n",
			},
			{ "blocks/away/brief.md": "# Brief\nBuild it.\nSee away:review.\n" },
		);
		expect(findings.find((f) => f.rule === "home-reference")?.severity).toBe("warning");
	});
	test("a new frontmatter name and a change at a `refers` line are expected", async () => {
		const source =
			"---\nname: code-reviewer\ndescription: Review the diff\n---\n# Review\nSee the planner skill.\nAnswer pass or fail.\n";
		const output =
			"---\nname: reviewer\ndescription: Review the diff\n---\n# Review\nSee the plan skill.\nAnswer pass or fail.\nEnd with `OUTCOME: pass` or `OUTCOME: fail`.\n";
		const annotation = (refers: string) =>
			`---\nblock: away/review\nkind: agent\nfiles: [blocks/away/review.md]\noutcomes: [pass, fail]\n${refers}---\n`;
		const run = (refers: string) =>
			assembled(
				{ "agents/reviewer.md": output },
				{ "blocks/away/review.md": source, "annotations/away/review.md": annotation(refers) },
			);
		expect(await run('refers:\n  - { name: planner, lines: "6" }\n')).toEqual([]);
		expect((await run("")).map((f) => f.message)).toEqual([
			"`agents/reviewer.md` changes lines of `blocks/away/review.md` that no touch covers: 6",
		]);
	});
	test("one change across two touches a blank line apart is covered", async () => {
		const source =
			"---\nname: reviewer\ndescription: Review the diff\n---\n# Review\nRead the bead.\n\nClose the bead.\n\nAnswer pass or fail.\n";
		const output =
			"---\nname: reviewer\ndescription: Review the diff\n---\n# Review\nRead the task and mark it done.\n\nAnswer pass or fail.\nEnd with `OUTCOME: pass` or `OUTCOME: fail`.\n";
		const annotation = (lines: string[]) =>
			`---\nblock: away/review\nkind: agent\nfiles: [blocks/away/review.md]\noutcomes: [pass, fail]\nother:\n${lines.map((l) => `  - { lines: "${l}" }\n`).join("")}---\n`;
		const run = (lines: string[]) =>
			assembled(
				{ "agents/reviewer.md": output },
				{ "blocks/away/review.md": source, "annotations/away/review.md": annotation(lines) },
			);
		expect(await run(["6", "8"])).toEqual([]);
		expect((await run(["6"])).map((f) => f.rule)).toEqual(["uncovered-change"]);
	});
	test("a change outside the annotated lines is listed for review", async () => {
		const findings = await assembled({
			"skills/plan/SKILL.md": (plugin["skills/plan/SKILL.md"] ?? "").replace(
				"# Plan",
				"# Planning, rewritten",
			),
		});
		expect(rulesOf(findings, "warning")).toContain("uncovered-change");
		expect(rulesOf(findings)).toEqual([]);
	});
	test("a plugin path that resolves to nothing", async () => {
		const findings = await assembled({
			"skills/loop/SKILL.md": (plugin["skills/loop/SKILL.md"] ?? "").replace(
				"prompts/brief.md",
				"prompts/breif.md",
			),
		});
		expect(rulesOf(findings)).toContain("unresolved-path");
	});
	test("an absolute path into the home directory", async () => {
		const findings = await assembled({
			"skills/loop/prompts/brief.md": `${plugin["skills/loop/prompts/brief.md"]}See /Users/someone/.claude/skills/x.md\n`,
		});
		expect(rulesOf(findings)).toContain("absolute-path");
	});
	test("a lead that never mentions one of the blocks", async () => {
		const findings = await assembled({
			"skills/loop/SKILL.md": (plugin["skills/loop/SKILL.md"] ?? "").replace(
				"then the reviewer agent",
				"then stop",
			),
		});
		expect(rulesOf(findings)).toContain("unresolved-handoff");
	});
	test("the plugin's own skills and agents may be named with its prefix", async () => {
		const lead = plugin["skills/loop/SKILL.md"] ?? "";
		const named = await assembled({
			"skills/loop/SKILL.md": `${lead}Invoke mini:plan, then start the agent mini:reviewer.\n`,
		});
		expect(named).toEqual([]);
		const unknown = await assembled({
			"skills/loop/SKILL.md": `${lead}Start the agent mini:nobody.\n`,
		});
		expect(unknown.map((f) => f.message)).toEqual([
			`\`skills/loop/SKILL.md\` line ${lead.split("\n").length}: \`mini:nobody\` is not a skill or an agent of this plugin`,
		]);
	});
	test("a block that never reports an outcome", async () => {
		const findings = await assembled({
			"agents/reviewer.md":
				"---\nname: reviewer\ndescription: Review the diff\n---\n# Review\nAnswer pass or fail.\n",
		});
		expect(rulesOf(findings)).toContain("missing-outcome");
	});
	test("a level that runs inside a block needs its loop written in that block", async () => {
		const leveled = STACK.replace(
			"start: plan",
			"levels: [task, step]\nstart: plan\ninside: { step: away/brief }",
		)
			.replace(
				"  build:\n    block: away/brief\n    reads: [tasks]\n    writes: [code]\n    outcomes: { done: review }",
				"  build:\n    block: away/brief\n    reads: [tasks]\n    writes: [code]\n    children: { done: review, escalated: escalated }\n    at:\n      step: { block: home/plan, reads: [tasks], outcomes: { done: done } }",
			)
			.replace("  plan:\n    block: home/plan", "  plan:\n    only: [task]\n    block: home/plan")
			.replace(
				"  review:\n    block: away/review",
				"  review:\n    only: [task]\n    block: away/review",
			);
		const { flat, findings } = loadStack(leveled);
		expect(findings.filter((f) => f.severity === "error")).toEqual([]);
		if (!flat) throw new Error("the leveled fixture does not load");
		const bundle = await loadBundle(await bundleDir());
		const lead = `${plugin["skills/loop/SKILL.md"]}Levels: task, step.\n`;
		const run = async (planSkill: string) =>
			rulesOf(
				await checkAssembled(
					await pluginDir({ "skills/loop/SKILL.md": lead, "skills/plan/SKILL.md": planSkill }),
					flat,
					bundle,
				),
			);
		const planSkill = plugin["skills/plan/SKILL.md"] ?? "";
		expect(await run(planSkill)).toContain("missing-loop");
		expect(await run(`${planSkill}\n## The step loop\n`)).not.toContain("missing-loop");
	});
	test("frontmatter without a name, and a missing assembly.json", async () => {
		expect(
			rulesOf(await assembled({ "agents/reviewer.md": "# Review\n`OUTCOME: pass`\n" })),
		).toContain("bad-frontmatter");
		expect(rulesOf(await assembled({ "assembly.json": null }))).toContain("missing-file");
	});
});

describe("command line", () => {
	const cli = join(import.meta.dir, "../src/cli.ts");
	const run = (...args: string[]) => {
		const result = Bun.spawnSync(["bun", cli, ...args]);
		return { code: result.exitCode, err: result.stderr.toString() };
	};
	test("a stack file that does not exist is a usage error, not a crash", () => {
		const { code, err } = run("stack", "/nowhere/stack.yaml");
		expect(code).toBe(64);
		expect(err).toContain("/nowhere/stack.yaml: no such file");
	});
	test("a bundle folder or plugin folder that does not exist is a usage error", () => {
		expect(run("assembled", "/nowhere/plugin", "--bundle", "/nowhere/bundle")).toEqual({
			code: 64,
			err: "/nowhere/bundle/stack.yaml: no such file\n",
		});
	});
	test("`assembled` without a bundle prints the usage", () => {
		expect(run("assembled", "/nowhere/plugin").code).toBe(64);
		expect(run("assembled", "/nowhere/plugin", "--bundle").code).toBe(64);
	});
});
