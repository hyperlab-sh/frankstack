import { describe, expect, test } from "bun:test";
import { readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkCatalog } from "../src/catalog.ts";
import type { Finding } from "../src/types.ts";
import { BLOCKS, block, git, HEADERS, sha, stack, swap, TEXTS, temp, write } from "./fixture.ts";

type Over = Parameters<typeof stack>[0];
const all = (findings: Finding[]) => findings.map((finding) => [finding.rule, finding.message]);
/** What the check says of the stack `alpha`, with some of it changed. */
const check = (over: Over = {}) => {
	const made = stack(over);
	return { ...made, found: all(checkCatalog(made.dir, made.clone)) };
};
const lineOf = (text: string, needle: string) => {
	const at = text.indexOf(needle);
	expect(at).toBeGreaterThanOrEqual(0);
	return text.slice(0, at).split("\n").length;
};
/** A file of a block as the stack's folder holds it. */
const held = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");

const ROUTE =
	'<fs:route outcome="done" to="alpha/execute">Then use execute to carry out the plan.</fs:route>';

describe("a sound stack", () => {
	test("has no finding", () => {
		expect(check().found).toEqual([]);
	});

	test("is named by its folder, however the folder is given", () => {
		const { dir, clone } = stack();
		expect(checkCatalog(`${dir}/`, clone)).toEqual([]);
	});
});

describe("stack.yaml", () => {
	test("missing, or not YAML", () => {
		for (const yaml of [undefined, "repository: [\n"]) {
			const { found } = check({ files: { "stack.yaml": yaml } });
			expect(found).toHaveLength(1);
			expect(found[0]?.[0]).toBe("invalid");
			expect(found[0]?.[1]).toStartWith("`stack.yaml` is missing or not valid YAML: ");
		}
	});

	test("not a mapping", () => {
		expect(check({ yaml: () => "- example/alpha\n" }).found).toEqual([
			["invalid", "`stack.yaml` must be a mapping"],
		]);
	});

	test("a key it does not have", () => {
		expect(check({ yaml: (yaml) => `${yaml}homepage: https://example.com\n` }).found).toEqual([
			["invalid", "`stack.yaml`: unknown key `homepage`"],
		]);
	});

	test("a key left out", () => {
		for (const key of ["repository", "commit", "licence", "imported"]) {
			const { found } = check({
				yaml: (yaml) =>
					yaml
						.split("\n")
						.filter((line) => !line.startsWith(`${key}:`))
						.join("\n"),
			});
			expect(found).toEqual([["invalid", `\`stack.yaml\`: \`${key}\` is missing`]]);
		}
	});

	test("a commit of digits is a number unless it is in quotes", () => {
		const { found } = check({ yaml: (yaml) => yaml.replace(/commit: .*/, "commit: 1234567") });
		expect(found).toEqual([
			["invalid", "`stack.yaml`: `commit` is missing or not text: write the commit in quotes"],
		]);
	});

	test("the date may be written with or without quotes", () => {
		const quoted = (yaml: string) => swap(yaml, "imported: 2026-11-22", 'imported: "2026-11-22"');
		expect(check({ yaml: quoted }).found).toEqual([]);
	});
});

describe("the files that go with a stack", () => {
	test("the licence", () => {
		for (const text of [undefined, ""])
			expect(check({ files: { LICENSE: text } }).found).toEqual([
				["missing-file", "`LICENSE` is missing or empty"],
			]);
	});

	test("the import report", () => {
		for (const text of [undefined, ""])
			expect(check({ files: { "IMPORT-REPORT.md": text } }).found).toEqual([
				["missing-file", "`IMPORT-REPORT.md` is missing or empty"],
			]);
	});

	test("a folder that is not there", () => {
		const { clone } = stack();
		const dir = join(temp(), "alpha");
		const found = all(checkCatalog(dir, clone));
		expect(found.map(([rule]) => rule)).toEqual([
			"invalid",
			"missing-file",
			"missing-file",
			"invalid",
			"invalid",
		]);
		expect(found.slice(3)).toEqual([
			["invalid", `\`${dir}\` cannot be read`],
			["invalid", "the stack has no block"],
		]);
	});

	test("a stack with no block", () => {
		const { dir, clone } = stack();
		for (const name of ["plan", "execute", "store"]) rmSync(join(dir, name), { recursive: true });
		expect(all(checkCatalog(dir, clone))).toEqual([["invalid", "the stack has no block"]]);
	});
});

describe("the commit the stack is pinned at", () => {
	const zeros = "0".repeat(40);

	test("a commit the clone does not have", () => {
		const { found, clone } = check({
			yaml: (yaml) => yaml.replace(/commit: .*/, `commit: "${zeros}"`),
		});
		expect(found).toEqual([
			[
				"missing-source",
				`\`${clone}\` has no commit \`${zeros}\`: the files cannot be compared with their source`,
			],
		]);
	});

	test("a folder that is no repository", () => {
		const { dir, commit } = stack();
		const clone = temp();
		expect(all(checkCatalog(dir, clone))).toEqual([
			[
				"missing-source",
				`\`${clone}\` has no commit \`${commit}\`: the files cannot be compared with their source`,
			],
		]);
	});

	test("a block from another commit", () => {
		const { dir, clone, commit, short } = stack();
		git(clone, "commit", "--quiet", "--allow-empty", "--message", "later");
		const later = git(clone, "rev-parse", "HEAD").slice(0, 7);
		expect(later).not.toBe(short);
		for (const other of [later, "2222222"]) {
			write(
				join(dir, "execute"),
				block(swap(HEADERS.execute, '"1111111"', `"${other}"`), {
					"SKILL.md": TEXTS.execute,
				}),
			);
			expect(all(checkCatalog(dir, clone))).toEqual([
				[
					"bad-header",
					`block \`alpha/execute\`: \`source.commit\` is \`${other}\`, and the stack is pinned at \`${commit}\``,
				],
			]);
		}
	});
});

describe("the header of a block of the catalog", () => {
	test("has `id` and `source`", () => {
		const { dir, clone } = stack();
		write(join(dir, "review"), BLOCKS.review ?? {});
		expect(all(checkCatalog(dir, clone))).toEqual([
			["bad-header", "block `alpha/review`: a block of the catalog has `id` and `source`"],
		]);
	});

	test("names the folder it is in", () => {
		const { dir, clone } = stack();
		renameSync(join(dir, "execute"), join(dir, "run"));
		expect(all(checkCatalog(dir, clone))).toEqual([
			[
				"wrong-block",
				"block `alpha/run`: its header says `alpha/execute`, and its folder is `run/`",
			],
			[
				"unknown-block",
				`block \`alpha/plan\`: \`fs:route\` at SKILL.md:${lineOf(held(dir, "plan/SKILL.md"), "<fs:route")} names \`alpha/execute\`, which is not a block of \`alpha\``,
			],
		]);
	});

	test("names the stack's repository", () => {
		const { found } = check({
			execute: { header: (header) => swap(header, "repo: example/alpha", "repo: example/other") },
		});
		expect(found).toEqual([
			[
				"bad-header",
				"block `alpha/execute`: `source.repo` is `example/other`, and the stack's repository is `example/alpha`",
			],
		]);
	});

	test("what a block's own reading finds is reported with its name", () => {
		const { dir, clone } = stack();
		const text = swap(held(dir, "execute/SKILL.md"), "Commit after every step.", "Commit often.");
		write(join(dir, "execute"), { "SKILL.md": text });
		const found = all(checkCatalog(dir, clone));
		expect(found.map(([rule]) => rule)).toEqual(["hash-mismatch", "source-mismatch"]);
		expect(found[0]?.[1]).toStartWith(
			"block `alpha/execute`: `SKILL.md` without its marks is not the original file (SHA-256 ",
		);
	});
});

describe("a block's files against their source", () => {
	test("a file the source does not have", () => {
		const { found, short } = check({
			execute: { files: { "notes.md": "Notes.\n" } },
			source: { "skills/execute/notes.md": undefined },
		});
		expect(found).toEqual([
			[
				"source-mismatch",
				`block \`alpha/execute\`: \`notes.md\` is not in the source: there is no \`skills/execute/notes.md\` at \`${short}\``,
			],
		]);
	});

	test("a file that is not what the source has", () => {
		const { found, short } = check({
			source: { "skills/execute/SKILL.md": "# Execute\n\nSomething else.\n" },
		});
		expect(found).toEqual([
			[
				"source-mismatch",
				`block \`alpha/execute\`: \`SKILL.md\` without its marks is not \`skills/execute/SKILL.md\` at \`${short}\``,
			],
		]);
	});

	test("a mark that hides a change of the text", () => {
		const { found, short } = check({
			execute: {
				text: (text) => swap(text, "Commit after every step.", "Commit after every task."),
			},
			source: { "skills/execute/SKILL.md": TEXTS.execute.replace(/<\/?fs:[^>]+>/g, "") },
		});
		expect(found).toEqual([
			[
				"source-mismatch",
				`block \`alpha/execute\`: \`SKILL.md\` without its marks is not \`skills/execute/SKILL.md\` at \`${short}\``,
			],
		]);
	});

	describe("a block of one file", () => {
		test("may give the file itself as its path", () => {
			expect(check().found).toEqual([]);
		});

		test("or the folder the file is in", () => {
			const { found } = check({
				store: { header: (header) => swap(header, "path: docs/tasks.md", "path: ./docs/") },
			});
			expect(found).toEqual([]);
		});

		test("the root of the repository is a folder too", () => {
			const { found } = check({
				store: { header: (header) => swap(header, "path: docs/tasks.md", "path: .") },
				source: { "docs/tasks.md": undefined, "tasks.md": TEXTS_STORE },
			});
			expect(found).toEqual([]);
		});

		test("both places are named when neither has it", () => {
			const { found, short } = check({
				source: { "docs/tasks.md": undefined, "README.md": "x\n" },
			});
			expect(found).toEqual([
				[
					"source-mismatch",
					`block \`alpha/store\`: \`tasks.md\` is not in the source: there is no \`docs/tasks.md/tasks.md\` or \`docs/tasks.md\` at \`${short}\``,
				],
			]);
		});

		test("the place that has a file is the one named when it differs", () => {
			const { found, short } = check({ source: { "docs/tasks.md": "# Tasks\n\nOther.\n" } });
			expect(found).toEqual([
				[
					"source-mismatch",
					`block \`alpha/store\`: \`tasks.md\` without its marks is not \`docs/tasks.md\` at \`${short}\``,
				],
			]);
		});
	});
});

describe("blocks a text points at", () => {
	test("a route to a block the stack does not have", () => {
		const { dir, clone } = stack();
		rmSync(join(dir, "execute"), { recursive: true });
		expect(all(checkCatalog(dir, clone))).toEqual([
			[
				"unknown-block",
				`block \`alpha/plan\`: \`fs:route\` at SKILL.md:${lineOf(held(dir, "plan/SKILL.md"), "<fs:route")} names \`alpha/execute\`, which is not a block of \`alpha\``,
			],
		]);
	});

	test("a reference to a block the stack does not have", () => {
		const { dir, clone } = stack({
			plan: { text: (text) => swap(text, ROUTE, "Then use execute to carry out the plan.") },
		});
		rmSync(join(dir, "execute"), { recursive: true });
		expect(all(checkCatalog(dir, clone))).toEqual([
			[
				"unknown-block",
				"block `alpha/plan`: `references` names `alpha/execute`, which is not a block of `alpha`",
			],
		]);
	});
});

describe("what betrays a provider of the stack", () => {
	const betrays = (id: string, where: string) => [
		"unmarked-fingerprint",
		`block \`${id}\`: ${where}: \`- [ ]\` belongs to \`alpha/store\` (\`TaskStorage\`) and is outside any mark that ties the passage to it`,
	];

	test("outside any mark", () => {
		const { found, dir } = check({
			execute: {
				text: (text) =>
					`${text}\nLeave a \`- [ ]\` box for what is left.\n\nNever add a \`- [ ]\` box.\n`,
			},
		});
		const text = held(dir, "execute/SKILL.md");
		expect(found).toEqual([
			betrays("alpha/execute", `SKILL.md:${lineOf(text, "Leave a")}, ${lineOf(text, "Never add")}`),
		]);
	});

	test("in a file that is not the main one", () => {
		const { found } = check({ plan: { files: { "template.md": "# Plan\n\n- [ ] Goal\n" } } });
		expect(found).toEqual([betrays("alpha/plan", "template.md:3")]);
	});

	test("inside a mark of a name the concept owns", () => {
		const { found } = check({
			plan: {
				text: (text) =>
					`${text}\nEach <fs:concept name="Task">\`- [ ]\` line</fs:concept> is one task.\n`,
			},
		});
		expect(found).toEqual([]);
	});

	test("inside a reference to the provider", () => {
		const { found } = check({
			plan: {
				header: (header) =>
					swap(
						header,
						"  alpha/execute: { kind: skill, required: false }\n",
						"  alpha/execute: { kind: skill, required: false }\n  alpha/store: { kind: playbook, required: false }\n",
					),
				text: (text) =>
					`${text}\n<fs:ref to="alpha/store">Each \`- [ ]\` line is one task.</fs:ref>\n`,
			},
		});
		expect(found).toEqual([]);
	});

	test("inside a mark of another concept", () => {
		const { found, dir } = check({
			plan: {
				text: (text) =>
					`${text}\n<fs:ref to="alpha/execute">Leave a \`- [ ]\` box for execute.</fs:ref>\n`,
			},
		});
		expect(found).toEqual([
			betrays("alpha/plan", `SKILL.md:${lineOf(held(dir, "plan/SKILL.md"), "Leave a")}`),
		]);
	});
});

test("the fixture's hashes are of the files without their marks", () => {
	const { dir } = stack();
	expect(held(dir, "store/tasks.md")).toContain(sha(TEXTS_STORE));
});

const TEXTS_STORE = "# Tasks\n\nA task is a `- [ ]` line of the plan file.\n";
