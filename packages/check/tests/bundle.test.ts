import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze } from "../src/analyze.ts";
import { checkAssembled } from "../src/assembled.ts";
import { loadBundle } from "../src/bundle.ts";
import { loadStack } from "../src/load.ts";
import type { Finding } from "../src/types.ts";

const STACK = `
name: mini
start: plan
ends: [done, escalated]
inputs: [request]
components:
  TaskStorage: { impl: tasks-md, replaces: [beads], capabilities: { claim: native } }
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
	"sources/home/lead.md": "---\nname: lead\ndescription: Lead\n---\n# Lead\n",
	"sources/home/plan.md": PLAN_SOURCE,
	"sources/away/review.md": "# Review\nAnswer pass or fail.\n",
	"sources/away/brief.md": "# Brief\nBuild it.\n",
	"blocks/home/lead.md":
		"---\nblock: home/lead\nkind: skill\nfiles: [sources/home/lead.md]\noutcomes: []\n---\n",
	"blocks/home/plan.md": [
		"---",
		"block: home/plan",
		"kind: skill",
		"files: [sources/home/plan.md]",
		"outcomes: [done]",
		"touches:",
		'  - { component: TaskStorage, impl: beads, lines: "7", what: "Creates items: with bd." }',
		"---",
		"",
	].join("\n"),
	"blocks/away/review.md":
		"---\nblock: away/review\nkind: agent\nfiles: [sources/away/review.md]\noutcomes: [pass, fail]\n---\n",
	"blocks/away/brief.md":
		"---\nblock: away/brief\nkind: prompt\nfiles: [sources/away/brief.md]\noutcomes: [done]\n---\n",
	"components/TaskStorage/tasks-md.md":
		"---\ncomponent: TaskStorage\nimpl: tasks-md\nstatus: chosen\n---\n",
	"components/TaskStorage/beads.md":
		'---\ncomponent: TaskStorage\nimpl: beads\nstatus: replaced\nfingerprints: ["bd create", ".beads"]\n---\n',
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
		"skills/loop/SKILL.md": { block: "home/lead", source: "sources/home/lead.md" },
		"skills/loop/prompts/brief.md": { block: "away/brief", source: "sources/away/brief.md" },
		"skills/plan/SKILL.md": { block: "home/plan", source: "sources/home/plan.md" },
		"agents/reviewer.md": { block: "away/review", source: "sources/away/review.md" },
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
	test("an annotation whose frontmatter is not YAML is reported with its file", async () => {
		const bundle = await loadBundle(
			await bundleDir({ "blocks/away/brief.md": "---\nblock: away/brief\nwhat: a: b: c\n---\n" }),
		);
		expect(bundle.findings).toHaveLength(1);
		expect(bundle.findings[0]?.message).toContain("blocks/away/brief.md");
	});
	test("an annotation that names a source file the bundle does not have", async () => {
		const bundle = await loadBundle(
			await bundleDir({
				"blocks/away/brief.md":
					"---\nblock: away/brief\nkind: prompt\nfiles: [sources/away/missing.md]\noutcomes: [done]\n---\n",
			}),
		);
		expect(bundle.findings.map((f) => f.message).join()).toContain("sources/away/missing.md");
	});
	test("touch lines accept `n`, `n-m` and comma lists, and nothing else", async () => {
		const withLines = (lines: string) =>
			bundleDir({
				"blocks/home/plan.md": (files["blocks/home/plan.md"] ?? "").replace(
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
	test("a leftover of the replaced implementation in a rewritten file is an error", async () => {
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
			{ "sources/home/plan.md": `${PLAN_SOURCE}${extra}` },
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
			{ "sources/home/plan.md": `${PLAN_SOURCE}${extra}` },
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
			{ "sources/away/brief.md": "# Brief\nBuild it.\nSee away:review.\n" },
		);
		expect(findings.find((f) => f.rule === "home-reference")?.severity).toBe("warning");
	});
	test("a new frontmatter name and a change at a `refers` line are expected", async () => {
		const source =
			"---\nname: code-reviewer\ndescription: Review the diff\n---\n# Review\nSee the planner skill.\nAnswer pass or fail.\n";
		const output =
			"---\nname: reviewer\ndescription: Review the diff\n---\n# Review\nSee the plan skill.\nAnswer pass or fail.\nEnd with `OUTCOME: pass` or `OUTCOME: fail`.\n";
		const annotation = (refers: string) =>
			`---\nblock: away/review\nkind: agent\nfiles: [sources/away/review.md]\noutcomes: [pass, fail]\n${refers}---\n`;
		const run = (refers: string) =>
			assembled(
				{ "agents/reviewer.md": output },
				{ "sources/away/review.md": source, "blocks/away/review.md": annotation(refers) },
			);
		expect(await run('refers:\n  - { name: planner, lines: "6" }\n')).toEqual([]);
		expect((await run("")).map((f) => f.message)).toEqual([
			"`agents/reviewer.md` changes lines of `sources/away/review.md` that no touch covers: 6",
		]);
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
	test("a block that never reports an outcome", async () => {
		const findings = await assembled({
			"agents/reviewer.md":
				"---\nname: reviewer\ndescription: Review the diff\n---\n# Review\nAnswer pass or fail.\n",
		});
		expect(rulesOf(findings)).toContain("missing-outcome");
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
