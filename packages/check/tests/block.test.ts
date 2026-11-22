import { describe, expect, test } from "bun:test";
import { fingerprint, loadBlock, readBlock, stackOf, walk } from "../src/block.ts";
import { BLOCKS, block, HEADERS, one, rules, swap, TEXTS, temp, write } from "./fixture.ts";

const read = (files: Record<string, string>) =>
	readBlock(new Map(Object.entries(files)), "block `x`");
const withHeader = (header: string, text = "Plain text.\n") =>
	read(block(header, { "SKILL.md": text }));
const MINIMAL = "kind: skill\ndoes: Does one thing.";

describe("a sound block", () => {
	test("is read with its header, its originals and its marks", () => {
		const plan = read(BLOCKS.plan ?? {});
		expect(plan.findings).toEqual([]);
		expect(plan.main).toBe("SKILL.md");
		expect(plan.header?.id).toBe("alpha/plan");
		expect(plan.header?.source).toEqual({
			repo: "example/alpha",
			commit: "1111111",
			path: "skills/plan",
		});
		expect(plan.header?.kind).toBe("skill");
		expect([...(plan.header?.references ?? [])]).toEqual([
			["alpha/execute", { kind: "skill", required: false }],
		]);
		expect(plan.header?.uses.get("TaskStorage")).toEqual({
			writtenFor: "alpha",
			verbs: ["create"],
			names: ["Task"],
			needs: [],
		});
		expect(plan.header?.inputs.get("design")).toEqual({ kind: "design", required: true });
		expect(plan.header?.outputs.get("plan")).toEqual({ kind: "plan", required: false });
		expect(plan.header?.outcomes).toEqual(["done", "blocked"]);
		expect([...plan.originals.keys()]).toEqual(["SKILL.md", "template.md"]);
		expect(plan.originals.get("SKILL.md")).not.toContain("<fs:");
		expect(plan.marks.map((mark) => mark.tag)).toEqual([
			"artifact",
			"path",
			"artifact",
			"path",
			"uses",
			"concept",
			"ref",
			"name",
			"route",
		]);
		expect(stackOf(plan)).toBe("alpha");
	});

	test("a mark's line counts the header, so it is the line in the file", () => {
		const plan = read(BLOCKS.plan ?? {});
		const file = (BLOCKS.plan?.["SKILL.md"] ?? "").split("\n");
		const ref = plan.marks.find((mark) => mark.tag === "ref");
		expect(file[(ref?.line ?? 0) - 1]).toContain('<fs:ref to="alpha/execute">');
		expect(plan.headerLines).toBe(file.indexOf("</fs:block>") + 1);
	});

	test("a provider's sentences, names, traits and fingerprints are read", () => {
		const tasks = read(BLOCKS.tasks ?? {});
		expect(tasks.findings).toEqual([]);
		const provides = tasks.header?.provides.get("TaskStorage");
		expect([...(provides?.verbs.keys() ?? [])]).toEqual(["create", "mark-done"]);
		expect(provides?.verbs.get("mark-done")).toBe("Close the ticket with `tk close <id>`.");
		expect([...(provides?.names ?? [])]).toEqual([["Task", { one: "ticket" }]]);
		expect(provides?.fingerprints).toEqual(["tk ", ".tickets/"]);
	});

	test("an imported block needs no id, and then belongs to no stack", () => {
		const review = read(BLOCKS.review ?? {});
		expect(review.findings).toEqual([]);
		expect(review.header?.id).toBeUndefined();
		expect(stackOf(review)).toBeUndefined();
	});

	test("an imported block may say which block it is, with no source", () => {
		const own = withHeader(`id: alpha/x\n${MINIMAL}`);
		expect(own.findings).toEqual([]);
		expect(own.header?.id).toBe("alpha/x");
		expect(own.header?.source).toBeUndefined();
		expect(stackOf(own)).toBe("alpha");
	});

	test("a provider's word for several is read when it is given", () => {
		const header = (names: string) =>
			`${MINIMAL}\nprovides:\n  Requirement: { verbs: { list: Read them. }, names: ${names} }`;
		const given = withHeader(
			header('{ Criterion: { one: criterion, many: criteria }, CriterionId: "AC-<n>" }'),
		);
		expect(given.findings).toEqual([]);
		expect([...(given.header?.provides.get("Requirement")?.names ?? [])]).toEqual([
			["Criterion", { one: "criterion", many: "criteria" }],
			["CriterionId", { one: "AC-<n>" }],
		]);
		for (const wrong of [
			"{ many: criteria }",
			"{ one: criterion, many: 2 }",
			"{ one: criterion, plural: criteria }",
			"{ one: '' }",
			"[criterion, criteria]",
		]) {
			expect(withHeader(header(`{ Criterion: ${wrong} }`)).findings.map((f) => f.message)).toEqual([
				"block `x`: `provides.Requirement.names.Criterion` must be the provider's word for it, or `{ one: <word>, many: <word> }`",
			]);
		}
	});

	test("is read the same from a folder, files in sub-folders included", () => {
		const dir = write(temp(), {
			...block(MINIMAL, { "SKILL.md": "Text.\n", "refs/notes.md": "Notes.\n" }),
		});
		expect(walk(dir)).toEqual(["SKILL.md", "refs/notes.md"]);
		const loaded = loadBlock(dir, "block `x`");
		expect(loaded.findings).toEqual([]);
		expect([...loaded.originals.keys()]).toEqual(["SKILL.md", "refs/notes.md"]);
	});

	test("a folder that does not exist has no files and no header", () => {
		expect(rules(loadBlock("/nonexistent/frankstack", "block `x`").findings)).toEqual([
			"bad-header",
		]);
	});
});

describe("files and hashes", () => {
	test("a file whose text was changed", () => {
		const files = { ...BLOCKS.plan };
		files["SKILL.md"] = swap(files["SKILL.md"] ?? "", "one sitting", "two sittings");
		const finding = one(read(files).findings, "hash-mismatch");
		expect(finding.message).toStartWith(
			"block `x`: `SKILL.md` without its marks is not the original file (SHA-256 ",
		);
	});

	test("moving a mark does not change the hash", () => {
		const files = { ...BLOCKS.plan };
		files["SKILL.md"] = swap(
			files["SKILL.md"] ?? "",
			'Keep every <fs:concept name="Task">task</fs:concept> small',
			'Keep <fs:concept name="Task">every task</fs:concept> small',
		);
		expect(read(files).findings).toEqual([]);
	});

	test("a file the header does not list, and one it lists that is not there", () => {
		const files: Record<string, string> = { ...BLOCKS.plan, "extra.md": "More.\n" };
		delete files["template.md"];
		const { findings } = read(files);
		expect(rules(findings).sort()).toEqual(["missing-file", "unlisted-file"]);
		expect(one(findings, "unlisted-file").message).toBe(
			"block `x`: `extra.md` is not listed under `files`",
		);
		expect(one(findings, "missing-file").message).toBe(
			"block `x`: `template.md` is listed under `files` and is not in the folder",
		);
	});

	test("a hash written in capitals is the same hash", () => {
		const files = { ...BLOCKS.tasks };
		files["SKILL.md"] = (files["SKILL.md"] ?? "").replace(/[0-9a-f]{64}/, (hash) =>
			hash.toUpperCase(),
		);
		expect(read(files).findings).toEqual([]);
	});

	test("a file that is not text keeps its bytes", () => {
		const bytes = String.fromCharCode(0, 255, 128, 10, 13, 200);
		const hash = new Bun.CryptoHasher("sha256").update(Buffer.from(bytes, "latin1")).digest("hex");
		const main = `<fs:block>\n${MINIMAL}\nfiles:\n  SKILL.md: ${new Bun.CryptoHasher("sha256").update("x\n").digest("hex")}\n  blob.bin: ${hash}\n</fs:block>\nx\n`;
		expect(read({ "SKILL.md": main, "blob.bin": bytes }).findings).toEqual([]);
	});
});

describe("the header", () => {
	test("no file has one", () => {
		const finding = one(read({ "SKILL.md": "Text.\n" }).findings, "bad-header");
		expect(finding.message).toBe("block `x`: no file starts with the header `<fs:block>`");
	});

	test("two files have one", () => {
		const { findings } = read({
			...block(MINIMAL, { "a.md": "A.\n" }),
			"b.md": block(MINIMAL, { "b.md": "B.\n" })["b.md"] ?? "",
		});
		expect(findings.map((finding) => finding.message)).toContain(
			"block `x`: more than one file starts with a header: a.md, b.md",
		);
	});

	test("that is not YAML, or not a mapping", () => {
		expect(rules(read({ "a.md": "<fs:block>\nkind: [skill\n</fs:block>\nA.\n" }).findings)).toEqual(
			["bad-header"],
		);
		expect(read({ "a.md": "<fs:block>\n- skill\n</fs:block>\nA.\n" }).findings[0]?.message).toBe(
			"block `x`: the header must be a mapping",
		);
	});

	test("without kind, does or files", () => {
		const { findings } = read({ "a.md": "<fs:block>\nassumes: nothing\n</fs:block>\nA.\n" });
		expect(findings.map((finding) => finding.message)).toEqual([
			"block `x`: `kind` is missing",
			"block `x`: `does` is missing",
			"block `x`: `files` must list every file of the block",
			"block `x`: `a.md` is not listed under `files`",
		]);
	});

	test("an unknown key", () => {
		expect(
			withHeader(`${MINIMAL}\ntouches: []`).findings.map((finding) => finding.message),
		).toEqual(["block `x`: unknown header key `touches`"]);
	});

	test("a `source` with no `id`", () => {
		expect(
			withHeader(`source: { repo: a/b, commit: "1", path: x }\n${MINIMAL}`).findings.map(
				(f) => f.message,
			),
		).toEqual(["block `x`: `source` needs `id`: only a block of a stack says where its files are"]);
	});

	test("an `id` that is not `<stack>/<block>`", () => {
		const header = `id: alpha\nsource: { repo: a/b, commit: "1", path: x }\n${MINIMAL}`;
		expect(withHeader(header).findings.map((f) => f.message)).toEqual([
			"block `x`: `id` must be `<stack>/<block>`",
		]);
	});

	test("a commit of digits must be written in quotes", () => {
		const header = `id: alpha/x\nsource: { repo: a/b, commit: 1234567, path: x }\n${MINIMAL}`;
		expect(withHeader(header).findings.map((f) => f.message)).toEqual([
			"block `x`: `source` needs `repo`, `commit` and `path`",
		]);
	});

	test("inputs, outputs and references need a kind", () => {
		const { findings } = withHeader(
			`${MINIMAL}\ninputs:\n  plan: {}\noutputs:\n  change: yes\nreferences:\n  a/b: { required: true }`,
		);
		expect(findings.map((finding) => finding.message)).toEqual([
			"block `x`: reference `a/b` needs `kind`",
			"block `x`: input `plan` needs `kind`",
			"block `x`: output `change` needs `kind`",
		]);
	});

	test("lists and mappings of the wrong shape", () => {
		const { findings } = withHeader(
			[
				MINIMAL,
				"uses:",
				"  Memory: { verbs: read }",
				"  Decisions: yes",
				"provides:",
				"  TaskStorage: { verbs: 3 }",
				"  Routing: { verbs: { report: '' }, names: { Task: 1 } }",
				"outcomes: [done]",
				"inputs: [plan]",
			].join("\n"),
		);
		expect(findings.map((finding) => finding.message)).toEqual([
			"block `x`: `uses.Memory.verbs` must be a list of names",
			"block `x`: `uses.Decisions` must be a mapping",
			"block `x`: `provides.TaskStorage.verbs` must map each verb to a sentence",
			"block `x`: `provides.Routing.verbs.report` must be a sentence",
			"block `x`: `provides.Routing.names.Task` must be the provider's word for it, or `{ one: <word>, many: <word> }`",
			"block `x`: `inputs` must be a mapping",
			"block `x`: `outcomes` must map each outcome to a sentence",
		]);
	});

	test("verbs given as a list have no sentence yet", () => {
		const { header, findings } = withHeader(
			`${MINIMAL}\nprovides:\n  Memory: { verbs: [read, write] }`,
		);
		expect(findings).toEqual([]);
		expect([...(header?.provides.get("Memory")?.verbs ?? [])]).toEqual([
			["read", undefined],
			["write", undefined],
		]);
	});

	test("parts are read with the outcomes each can end with", () => {
		const { header, findings } = withHeader(
			`${MINIMAL}\nparts:\n  gate: { outcomes: { pass: Fine., fail: Not fine. } }\n  notes: {}`,
			'<fs:part name="gate">Check.</fs:part>\n<fs:part name="notes">Notes.</fs:part>\n',
		);
		expect(findings).toEqual([]);
		expect([...(header?.parts ?? [])]).toEqual([
			["gate", ["pass", "fail"]],
			["notes", []],
		]);
	});
});

describe("terms the language does not have", () => {
	const unknown = (header: string, text?: string) =>
		withHeader(header, text)
			.findings.filter((finding) => finding.rule === "unknown-term")
			.map((finding) => finding.message.replace("block `x`: ", ""));

	test("a block kind, a reference kind and an artifact kind", () => {
		expect(
			unknown(
				"kind: recipe\ndoes: X.\nreferences:\n  a/b: { kind: command }\ninputs:\n  x: { kind: spec }\noutputs:\n  y: { kind: PRD }",
				'<fs:ref to="a/b">b</fs:ref><fs:artifact name="x">x</fs:artifact>\n',
			),
		).toEqual([
			"`recipe` is not a block kind",
			"reference `a/b`: `command` is not a block kind",
			"input `x`: `spec` is not an artifact kind",
			"output `y`: `PRD` is not an artifact kind",
		]);
	});

	test("a concept, a verb, a trait and a name under `uses`", () => {
		expect(
			unknown(
				`${MINIMAL}\nuses:\n  Handoff: {}\n  Memory: { verbs: [recall], needs: [numbered], names: [Task] }\n  Task: {}`,
				'<fs:uses concept="Memory" verb="recall">r</fs:uses><fs:concept name="Task">t</fs:concept>\n',
			),
		).toEqual([
			"`uses`: `Handoff` is not a concept a block provides",
			"`Memory` has no verb `recall`",
			"`Memory` has no trait `numbered`",
			"`Task` is not a concept the provider of `Memory` names",
			"`uses`: `Task` is not a concept a block provides",
		]);
	});

	test("a concept, a verb, a trait and a name under `provides`", () => {
		expect(
			unknown(
				`${MINIMAL}\nprovides:\n  Storage: {}\n  Harness: {}\n  Decisions: { verbs: [vote], traits: [stable-ids], names: { Lesson: note } }`,
			),
		).toEqual([
			"`provides`: `Storage` is not a concept a block provides",
			"`Harness` is settled by the target; no block provides it",
			"`Decisions` has no verb `vote`",
			"`Decisions` has no trait `stable-ids`",
			"`Lesson` is not a concept the provider of `Decisions` names",
		]);
	});

	test("the harness can be used for its traits, and has no verb", () => {
		expect(unknown(`${MINIMAL}\nuses:\n  Harness: { needs: [subagents] }`)).toEqual([]);
		expect(unknown(`${MINIMAL}\nuses:\n  Harness: { needs: [teams] }`)).toEqual([
			"`Harness` has no trait `teams`",
		]);
	});

	test("a `fs:concept` that names no concept", () => {
		const { findings } = withHeader(MINIMAL, 'A <fs:concept name="Bead">bead</fs:concept>.\n');
		expect(findings.map((finding) => finding.message)).toEqual([
			"block `x`: SKILL.md:7: `Bead` is not a concept of the language",
		]);
	});

	test("a `fs:concept` can name an artifact kind or a provided concept with nothing declared", () => {
		const text =
			'The <fs:concept name="plan">plan</fs:concept> of <fs:concept name="Routing">it</fs:concept>.\n';
		expect(withHeader(MINIMAL, text).findings).toEqual([]);
	});
});

describe("where the header and the marks disagree", () => {
	const messages = (header: string, text: string, rule: string) =>
		withHeader(header, text)
			.findings.filter((finding) => finding.rule === rule)
			.map((finding) => finding.message.replace("block `x`: ", ""));

	test("a mark names what the header does not declare", () => {
		const text = [
			'<fs:ref to="a/b">b</fs:ref>',
			'<fs:uses concept="Memory" verb="read">r</fs:uses>',
			'<fs:uses concept="Decisions" verb="write">w</fs:uses>',
			'<fs:uses concept="Decisions" purpose="says where decisions go">p</fs:uses>',
			'<fs:concept name="Task">t</fs:concept>',
			'<fs:route outcome="done" to="a/c">go</fs:route>',
			'<fs:artifact name="plan">p</fs:artifact>',
			'<fs:part name="gate">g</fs:part>',
		].join("\n");
		const header = `${MINIMAL}\nuses:\n  Decisions: { verbs: [read] }`;
		expect(messages(header, `${text}\n`, "undeclared-name")).toEqual([
			"SKILL.md:9: `fs:ref` names `a/b`, which is not under `references`",
			"SKILL.md:10: `fs:uses` names `Memory`, which is not under `uses`",
			"SKILL.md:11: `fs:uses` does `write`, which is not under `uses.Decisions.verbs`",
			"SKILL.md:13: `fs:concept` names `Task`, which is not under `uses.TaskStorage.names`",
			"SKILL.md:14: `fs:route` stands for `done`, which is not under `outcomes`",
			"SKILL.md:15: `fs:artifact` names `plan`, which is neither an input nor an output",
			"SKILL.md:16: `fs:part` names `gate`, which is not under `parts`",
		]);
	});

	test("the header declares what no mark names", () => {
		const header = [
			MINIMAL,
			"references:",
			"  a/b: { kind: skill }",
			"uses:",
			"  Memory: { verbs: [read, write], names: [Lesson] }",
			"parts:",
			"  gate: { outcomes: { pass: Fine. } }",
		].join("\n");
		expect(
			messages(header, '<fs:uses concept="Memory" verb="read">r</fs:uses>\n', "unmarked-name"),
		).toEqual([
			"reference `a/b` is declared and no `fs:ref` names it",
			"`uses.Memory.verbs` lists `write` and no `fs:uses` does it",
			"`uses.Memory.names` lists `Lesson` and no `fs:concept` names it",
			"part `gate` is declared and no `fs:part` marks it",
		]);
	});

	test("a provider names its own concepts without listing them under `uses`", () => {
		const header = `${MINIMAL}\nprovides:\n  TaskStorage: { verbs: { create: Add it. }, names: { Task: ticket } }`;
		expect(withHeader(header, 'A <fs:concept name="Task">ticket</fs:concept>.\n').findings).toEqual(
			[],
		);
	});

	test("a route can stand for the outcome of a part, whatever its case", () => {
		const header = `${MINIMAL}\nparts:\n  gate: { outcomes: { not_ready: Wait. } }`;
		const text =
			'<fs:part name="gate"><fs:route outcome="NOT-READY" to="a/b">wait</fs:route></fs:part>\n';
		expect(withHeader(header, text).findings).toEqual([]);
	});

	test("a use with a purpose needs the concept declared, and no verb", () => {
		const header = `${MINIMAL}\nuses:\n  Memory: { written-for: alpha }`;
		const text =
			'<fs:uses concept="Memory" purpose="says where lessons are kept">Lessons go in notes.</fs:uses>\n';
		expect(withHeader(header, text).findings).toEqual([]);
	});

	test("a mark that is not closed is reported with its file and line", () => {
		const files = { ...BLOCKS.review };
		files["review.md"] = swap(files["review.md"] ?? "", "</fs:path></fs:artifact>", "</fs:path>");
		const finding = one(read(files).findings, "bad-mark");
		expect(finding.message).toMatch(/^block `x`: review\.md:\d+: `<fs:artifact>` is not closed$/);
	});
});

describe("the mark of a reference that is optional", () => {
	const header = (required: boolean) =>
		`${MINIMAL}\nreferences:\n  a/b: { kind: skill, required: ${required} }`;
	const warned = (text: string, required = false) =>
		withHeader(header(required), text).findings.map((f) => [f.rule, f.severity, f.message]);
	const NARROW = 'Build it.\nThen use <fs:ref to="a/b"><fs:name>b</fs:name></fs:ref> to check.\n';

	test("is a warning when it covers the name and nothing else", () => {
		const line = 10;
		expect(warned(NARROW)).toEqual([
			[
				"narrow-mark",
				"warning",
				`block \`x\`: SKILL.md:${line}: \`fs:ref\` to \`a/b\`, which is optional, covers only its name: when nothing stands for it the sentence around is left with a hole. Mark all the text that only makes sense when the block is there`,
			],
		]);
	});

	test("punctuation around the name is still the name alone", () => {
		const text = 'The keys (read by <fs:ref to="a/b">`<fs:name>b</fs:name>`</fs:ref>) are few.\n';
		expect(warned(text).map(([rule]) => rule)).toEqual(["narrow-mark"]);
	});

	test("is sound when it covers a whole aside in brackets", () => {
		expect(
			warned('Test the behavior<fs:ref to="a/b"> (<fs:name>b</fs:name>)</fs:ref>; not the text.\n'),
		).toEqual([]);
	});

	test("is sound when it covers the words that go with the name", () => {
		expect(
			warned('Build it. <fs:ref to="a/b">Then use <fs:name>b</fs:name> to check.</fs:ref>\n'),
		).toEqual([]);
	});

	test("is not judged without a name inside it, or for a required reference", () => {
		expect(warned('Build it, then <fs:ref to="a/b">b</fs:ref>.\n')).toEqual([]);
		expect(warned(NARROW, true)).toEqual([]);
	});
});

describe("finding what betrays a provider", () => {
	const found = (betrays: string, text: string) => [...text.matchAll(fingerprint(betrays))].length;

	test("a word is found whole", () => {
		expect(found("bd", "run bd ready, then bd close")).toBe(2);
		expect(found("bd", "abd bdx my-bd bd-x")).toBe(0);
		expect(found("bd", "`bd`, (bd) and bd.")).toBe(3);
	});

	test("what starts or ends with another character is found anywhere", () => {
		expect(found(".tickets/", "see x.tickets/y and .tickets/z")).toBe(2);
		expect(found("tk ", "tk add, atk add")).toBe(1);
		expect(found("OUTCOME:", "OUTCOME: done, NOOUTCOME: x")).toBe(1);
	});

	test("characters that mean something in a pattern are taken as they are", () => {
		expect(found("a.b", "a.b axb")).toBe(1);
		expect(found("{BEAD_ID}", "use {BEAD_ID} here")).toBe(1);
		expect(found("- [ ]", "- [ ] one\n- [x] two")).toBe(1);
	});
});

test("the fixture's headers and texts are the ones its blocks are built from", () => {
	for (const name of ["plan", "execute", "tasks", "review", "router"] as const) {
		const main = Object.values(BLOCKS[name] ?? {})[0] ?? "";
		expect(main).toContain(HEADERS[name].trim());
		expect(main).toEndWith(TEXTS[name]);
	}
});
