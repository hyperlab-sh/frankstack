import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	ASSEMBLY,
	assembly,
	BUNDLE,
	block,
	bundle,
	remade,
	stack,
	swap,
	temp,
	write,
} from "./fixture.ts";

const CLI = join(import.meta.dir, "../src/cli.ts");
const USAGE = `frankstack-check bundle <bundle folder>
frankstack-check expand <bundle folder>
frankstack-check assembled <assembly folder> --bundle <bundle folder> [--catalog <catalog folder>]
frankstack-check catalog <stack folder> --source <clone of the stack's repository>
`;

function cli(...args: string[]) {
	const run = Bun.spawnSync([process.execPath, CLI, ...args], { stdout: "pipe", stderr: "pipe" });
	return { code: run.exitCode, out: run.stdout.toString(), err: run.stderr.toString() };
}
const CLEAN = { code: 0, out: "0 error(s), 0 warning(s)\n", err: "" };
const usage = { code: 64, out: "", err: USAGE };
const LOOP = swap(BUNDLE, "fail: { to: build, max: 2, then: escalated }", "fail: build");
const EXPANDED = `flow ship
plan  [plan]
  reads design
  writes plan
  done -> build
  blocked -> escalated
build  [execute]
  reads findings?, plan
  writes change
  done -> review
review  [review]
  reads change
  writes findings
  pass -> done
`;

describe("a command line that cannot be run", () => {
	test("says how it is used", () => {
		const dir = bundle();
		for (const args of [
			[],
			["bundle"],
			["frob", dir],
			["assembled", dir],
			["assembled", dir, "--bundle"],
			["assembled", dir, "--bundle", "--catalog", dir],
			["assembled", dir, "--bundle", dir, "--catalog"],
			["catalog", dir],
			["catalog", dir, "--source"],
		])
			expect(cli(...args)).toEqual(usage);
	});

	test("names the folder that is not there", () => {
		const dir = bundle();
		const none = join(temp(), "none");
		for (const args of [
			["bundle", none],
			["expand", none],
			["assembled", none, "--bundle", dir],
			["assembled", dir, "--bundle", none],
			["assembled", dir, "--bundle", dir, "--catalog", none],
			["catalog", none, "--source", dir],
			["catalog", dir, "--source", none],
		])
			expect(cli(...args)).toEqual({ code: 64, out: "", err: `${none}: no such folder\n` });
	});

	test("a file is not a folder", () => {
		const file = join(bundle(), "bundle.yaml");
		expect(cli("bundle", file)).toEqual({ code: 64, out: "", err: `${file}: no such folder\n` });
	});
});

describe("bundle", () => {
	test("a sound bundle", () => {
		expect(cli("bundle", bundle())).toEqual(CLEAN);
	});

	test("an error fails, with the path that shows it", () => {
		expect(cli("bundle", bundle({ yaml: LOOP }))).toEqual({
			code: 1,
			out: `error   unbounded-cycle: flow \`ship\`: this loop has no bound, so the run may never end
          review -(fail)-> build
          build -(done)-> review
1 error(s), 0 warning(s)
`,
			err: "",
		});
	});

	test("a warning does not fail", () => {
		const tasks = remade("tasks", {
			header: (header) => swap(header, "    names: { Task: ticket }\n", ""),
		});
		expect(cli("bundle", bundle({ blocks: { tasks } }))).toEqual({
			code: 0,
			out: `warning unnamed-concept: block \`plan\` names \`Task\`, and \`tasks\` gives no name for it: the assembler writes the ordinary word
0 error(s), 1 warning(s)
`,
			err: "",
		});
	});
});

describe("expand", () => {
	test("prints every step with what it reads, writes and where it goes", () => {
		expect(cli("expand", bundle())).toEqual({
			code: 0,
			out: `${EXPANDED}  fail -> build (at most 2 times)\n  fail -> escalated (after that)\n`,
			err: "",
		});
	});

	test("prints a flow that has errors, and leaves them to `bundle`", () => {
		expect(cli("expand", bundle({ yaml: LOOP }))).toEqual({
			code: 0,
			out: `${EXPANDED}  fail -> build\n`,
			err: "",
		});
	});

	test("says why a flow could not be read", () => {
		expect(cli("expand", bundle({ yaml: swap(BUNDLE, "    start: plan\n", "") }))).toEqual({
			code: 1,
			out: "error   invalid: flow `ship`: `start` is missing\n1 error(s), 0 warning(s)\n",
			err: "",
		});
	});

	test("says why a bundle could not be read", () => {
		const { code, out } = cli("expand", bundle({ yaml: "name: [\n" }));
		expect(code).toBe(1);
		expect(out).toStartWith("error   invalid: `bundle.yaml` is not valid YAML: ");
		expect(out).toEndWith("\n1 error(s), 0 warning(s)\n");
	});
});

describe("assembled", () => {
	test("a careful assembly", () => {
		expect(cli("assembled", assembly(), "--bundle", bundle())).toEqual(CLEAN);
	});

	test("a defect fails", () => {
		const dir = assembly({ "ASSEMBLY-REPORT.md": undefined });
		expect(cli("assembled", dir, "--bundle", bundle())).toEqual({
			code: 1,
			out: "error   missing-file: `ASSEMBLY-REPORT.md` is missing\n1 error(s), 0 warning(s)\n",
			err: "",
		});
	});

	test("a bundle with errors is reported instead", () => {
		const { code, out } = cli("assembled", assembly(), "--bundle", bundle({ yaml: LOOP }));
		expect(code).toBe(1);
		expect(out).toStartWith(
			"the bundle itself has errors; fix those first\nerror   unbounded-cycle: flow `ship`: ",
		);
	});

	test("a warning does not fail", () => {
		const dir = assembly({ "notes/README.md": "Notes.\n" });
		expect(cli("assembled", dir, "--bundle", bundle())).toEqual({
			code: 0,
			out: "warning unlisted-file: `notes/README.md` is not listed in `assembly.json`\n0 error(s), 1 warning(s)\n",
			err: "",
		});
	});

	test("the catalog is read when it is given", () => {
		const plan = remade("plan", {
			header: (header) =>
				swap(
					header,
					"written-for: alpha, verbs: [create]",
					"written-for: gamma/store, verbs: [create]",
				),
		});
		const from = bundle({ blocks: { plan } });
		const without = cli("assembled", assembly(), "--bundle", from);
		expect(without.code).toBe(0);
		expect(without.out).toStartWith("warning fingerprints-not-checked: ");
		expect(without.out).toEndWith("\n0 error(s), 1 warning(s)\n");

		const catalog = temp();
		write(
			join(catalog, "gamma/store"),
			block(
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
			),
		);
		expect(cli("assembled", assembly(), "--bundle", from, "--catalog", catalog)).toEqual(CLEAN);
		const kept = assembly({
			"skills/lead/SKILL.md": `${ASSEMBLY["skills/lead/SKILL.md"]}\nTick the \`- [ ]\` box.\n`,
		});
		const left = cli("assembled", kept, "--bundle", from, "--catalog", catalog);
		expect(left.code).toBe(0);
		expect(left.out).toStartWith("warning leftover-fingerprint: `skills/lead/SKILL.md` line 8: ");
	});
});

describe("catalog", () => {
	test("a sound stack", () => {
		const { dir, clone } = stack();
		expect(cli("catalog", dir, "--source", clone)).toEqual(CLEAN);
	});

	test("a stack that is not its source", () => {
		const { dir, clone, short } = stack({
			source: { "skills/execute/SKILL.md": "# Execute\n\nSomething else.\n" },
		});
		expect(cli("catalog", dir, "--source", clone)).toEqual({
			code: 1,
			out: `error   source-mismatch: block \`alpha/execute\`: \`SKILL.md\` without its marks is not \`skills/execute/SKILL.md\` at \`${short}\`
1 error(s), 0 warning(s)
`,
			err: "",
		});
	});
});
