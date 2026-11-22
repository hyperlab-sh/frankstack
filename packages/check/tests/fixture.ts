import { expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Finding } from "../src/types.ts";

export const sha = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
/** A text with its marks taken out, done without the checker's own reader. */
export const unmarked = (text: string) => text.replace(/<\/?fs:[a-z]+(?: [a-z-]+="[^"]*")*>/g, "");

/**
 * The files of a block. The header goes into the first file, with the hash of every file's
 * original added to it.
 */
export function block(header: string, files: Record<string, string>): Record<string, string> {
	const entries = Object.entries(files);
	const hashes = entries.map(([name, text]) => `  "${name}": ${sha(unmarked(text))}`).join("\n");
	return Object.fromEntries(
		entries.map(([name, text], index) => [
			name,
			index === 0 ? `<fs:block>\n${header.trim()}\nfiles:\n${hashes}\n</fs:block>\n${text}` : text,
		]),
	);
}

export function write(dir: string, files: Record<string, string | undefined>): string {
	for (const [path, text] of Object.entries(files)) {
		if (text === undefined) continue;
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	return dir;
}
export const temp = () => mkdtempSync(join(tmpdir(), "frankstack-check-"));

export const rules = (findings: Finding[]) => findings.map((finding) => finding.rule);
export const errorsOf = (findings: Finding[]) =>
	findings.filter((finding) => finding.severity === "error");
export const one = (findings: Finding[], rule: string) => {
	const hits = findings.filter((finding) => finding.rule === rule);
	expect(hits).toHaveLength(1);
	return hits[0] as Finding;
};
/** Replaces exactly one occurrence, so a typo in a test cannot pass silently. */
export const swap = (text: string, from: string, to: string) => {
	expect(text.split(from)).toHaveLength(2);
	return text.replace(from, () => to);
};

const PLAN_HEADER = `
id: alpha/plan
source: { repo: example/alpha, commit: "1111111", path: skills/plan }
kind: skill
does: Turns a design into a plan.
references:
  alpha/execute: { kind: skill, required: false }
uses:
  TaskStorage: { written-for: alpha, verbs: [create], names: [Task] }
inputs:
  design: { kind: design, required: true }
outputs:
  plan: { kind: plan }
outcomes:
  done: The plan is saved.
  blocked: The design leaves a question open.
`;
const PLAN_TEXT = `---
name: plan
description: Use when a design is approved and the work needs a plan
---

# Plan

Read the design at <fs:artifact name="design"><fs:path>docs/design.md</fs:path></fs:artifact> first.

Save the plan to <fs:artifact name="plan"><fs:path>docs/plans/plan.md</fs:path></fs:artifact> when it is complete.

<fs:uses concept="TaskStorage" verb="create">Write each task as a \`- [ ]\` entry with the files it touches.</fs:uses>

Keep every <fs:concept name="Task">task</fs:concept> small enough for one sitting.

<fs:ref to="alpha/execute">Without subagents, use <fs:name>execute</fs:name> instead.</fs:ref>

<fs:route outcome="done" to="alpha/execute">Then use execute to carry out the plan.</fs:route>
`;

const EXECUTE_HEADER = `
id: alpha/execute
source: { repo: example/alpha, commit: "1111111", path: skills/execute }
kind: skill
does: Carries out a plan task by task.
uses:
  TaskStorage: { written-for: alpha, verbs: [mark-done] }
inputs:
  plan: { kind: plan, required: true }
  notes: { kind: findings, required: false }
outputs:
  change: { kind: change }
outcomes:
  done: Every task is done.
`;
const EXECUTE_TEXT = `---
name: execute
description: Use when a plan is ready to be carried out
---

# Execute

Follow the plan at <fs:artifact name="plan"><fs:path>docs/plans/plan.md</fs:path></fs:artifact> one step at a time.

<fs:uses concept="TaskStorage" verb="mark-done">Tick the \`- [ ]\` box of a task when it is finished.</fs:uses>

<fs:artifact name="notes">If there are review notes at <fs:path>docs/notes.md</fs:path>, fix those first.</fs:artifact>

Commit after every step.
`;

const TASKS_HEADER = `
id: beta/tasks
source: { repo: example/beta, commit: "2222222", path: skills/tasks }
kind: skill
does: Keeps tasks as tickets.
provides:
  TaskStorage:
    verbs:
      create: "Add each task with \`tk add\`, as the \`{name}\` skill describes."
      mark-done: "Close the ticket with \`tk close <id>\`."
    names: { Task: ticket }
    fingerprints: ["tk ", ".tickets/"]
`;
const TASKS_TEXT = `---
name: tasks
description: Use to keep the work as tickets
---

# Tickets

Keep every piece of work as a ticket under \`.tickets/\`. Add one with \`tk add\`.
`;

const REVIEW_HEADER = `
kind: agent
does: Reviews a change against its plan.
inputs:
  change: { kind: change, required: true }
outputs:
  findings: { kind: findings }
outcomes:
  pass: Nothing blocks the change.
  fail: Something must be fixed.
`;
const REVIEW_TEXT = `---
name: review
description: Reviews a change against its plan
---

Review the change in <fs:artifact name="change"><fs:path>the working tree</fs:path></fs:artifact> and list every problem.
`;

const ROUTER_HEADER = `
kind: playbook
does: Says how a block reports its outcome and how a lead is written.
provides:
  Routing:
    verbs:
      report: "End with the line \`OUTCOME: {outcome}\`."
    fingerprints: ["OUTCOME:"]
`;
const ROUTER_TEXT = `# Routing

A block ends by reporting one outcome. The lead reads it and starts the next block.
`;

/** The blocks of the sound bundle, by the name they are installed under. */
export const BLOCKS: Record<string, Record<string, string>> = {
	plan: block(PLAN_HEADER, { "SKILL.md": PLAN_TEXT, "template.md": "# Plan\n\n- Goal\n- Steps\n" }),
	execute: block(EXECUTE_HEADER, { "SKILL.md": EXECUTE_TEXT }),
	tasks: block(TASKS_HEADER, { "SKILL.md": TASKS_TEXT }),
	review: block(REVIEW_HEADER, { "review.md": REVIEW_TEXT }),
	router: block(ROUTER_HEADER, { "PLAYBOOK.md": ROUTER_TEXT }),
};
export const HEADERS = {
	plan: PLAN_HEADER,
	execute: EXECUTE_HEADER,
	tasks: TASKS_HEADER,
	review: REVIEW_HEADER,
	router: ROUTER_HEADER,
};
export const TEXTS = {
	plan: PLAN_TEXT,
	execute: EXECUTE_TEXT,
	tasks: TASKS_TEXT,
	review: REVIEW_TEXT,
	router: ROUTER_TEXT,
};

type Name = keyof typeof HEADERS;
const MAIN: Record<Name, string> = {
	plan: "SKILL.md",
	execute: "SKILL.md",
	tasks: "SKILL.md",
	review: "review.md",
	router: "PLAYBOOK.md",
};
const same = (text: string) => text;

/** One of the sound blocks with its header or its text changed, and its hashes computed again. */
export function remade(
	name: Name,
	change: { header?: (header: string) => string; text?: (text: string) => string },
): Record<string, string> {
	const files = { [MAIN[name]]: (change.text ?? same)(TEXTS[name]) };
	if (name === "plan") files["template.md"] = "# Plan\n\n- Goal\n- Steps\n";
	return block((change.header ?? same)(HEADERS[name]), files);
}

/** A sound bundle: three blocks of two stacks, two imported, one flow with a bounded loop. */
export const BUNDLE = `name: demo
description: From a design to a reviewed change.
target: claude-code-plugin
concepts:
  TaskStorage: tasks
  Routing: router
blocks:
  plan:
    from: alpha/plan
    references: { alpha/execute: execute }
  execute: { from: alpha/execute }
  tasks: { from: beta/tasks }
  review: { origin: imported }
  router: { origin: imported }
  lead:
    origin: created
    kind: skill
    does: Leads the ship flow.
flows:
  ship:
    description: From a design to a reviewed change.
    lead: lead
    start: plan
    ends: [done, escalated]
    inputs: [design]
    artifacts: { design: design, plan: plan, change: change, findings: findings }
    files:
      design: docs/design.md
      plan: notes/plan.md
      change: (the working tree)
      findings: notes/findings.md
      counters: notes/counters.json
    steps:
      plan:
        does: Plan the work.
        block: plan
        inputs: { design: design }
        outputs: { plan: plan }
        outcomes: { done: build, blocked: escalated }
      build:
        does: Build it.
        block: execute
        inputs: { plan: plan }
        outputs: { change: change }
        reads: [{ artifact: findings, optional: true }]
        outcomes: { done: review }
      review:
        does: Review the change.
        block: review
        inputs: { change: change }
        outputs: { findings: findings }
        outcomes:
          pass: done
          fail: { to: build, max: 2, then: escalated }
`;

type Blocks = Record<string, Record<string, string> | undefined>;

/** Writes a bundle folder. A block given as `undefined` has no folder. */
export function bundle(
	over: { yaml?: string; blocks?: Blocks; files?: Record<string, string> } = {},
): string {
	const dir = temp();
	write(dir, {
		"bundle.yaml": over.yaml ?? BUNDLE,
		"licenses/alpha/LICENSE": "MIT, alpha\n",
		"licenses/beta/LICENSE": "MIT, beta\n",
		...over.files,
	});
	for (const [name, files] of Object.entries({ ...BLOCKS, ...over.blocks })) {
		if (files) write(join(dir, "blocks", name), files);
	}
	return dir;
}

const OUTCOMES = (lines: string) =>
	`\n## Outcomes\n\n${lines}\n\nEnd with the line \`OUTCOME: <outcome>\`.\n`;

/** What a careful assembler writes from the sound bundle. */
export const ASSEMBLY: Record<string, string> = {
	".claude-plugin/plugin.json": '{ "name": "demo" }\n',
	"ASSEMBLY-REPORT.md": "# Assembly report\n\nNothing was left open.\n",
	"LICENSES/alpha/LICENSE": "MIT, alpha\n",
	"LICENSES/beta/LICENSE": "MIT, beta\n",
	"assembly.json": JSON.stringify({
		files: {
			"skills/plan/SKILL.md": { block: "plan", file: "SKILL.md" },
			"skills/plan/template.md": { block: "plan", file: "template.md" },
			"skills/execute/SKILL.md": { block: "execute", file: "SKILL.md" },
			"skills/tasks/SKILL.md": { block: "tasks", file: "SKILL.md" },
			"agents/review.md": { block: "review", file: "review.md" },
			"playbooks/router.md": { block: "router", file: "PLAYBOOK.md" },
			"skills/lead/SKILL.md": { block: "lead", origin: "lead" },
		},
	}),
	"skills/plan/SKILL.md": `---
name: plan
description: Use when a design is approved and the work needs a plan
---

# Plan

Read the design at docs/design.md first.

Save the plan to notes/plan.md when it is complete.

Add each task with \`tk add\`, as the \`demo:tasks\` skill describes.

Keep every ticket small enough for one sitting.

Without subagents, use demo:execute instead.

End with the line \`OUTCOME: done\`.
${OUTCOMES("- `done`: The plan is saved.\n- `blocked`: The design leaves a question open.")}`,
	"skills/plan/template.md": "# Plan\n\n- Goal\n- Steps\n",
	"skills/execute/SKILL.md": `---
name: execute
description: Use when a plan is ready to be carried out
---

# Execute

Follow the plan at notes/plan.md one step at a time.

Close the ticket with \`tk close <id>\`.

Commit after every step.
${OUTCOMES("- `done`: Every task is done.")}`,
	"skills/tasks/SKILL.md": TASKS_TEXT,
	"agents/review.md": `---
name: review
description: Reviews a change against its plan
---

Review the change in the working tree and list every problem.
${OUTCOMES("- `pass`: Nothing blocks the change.\n- `fail`: Something must be fixed.")}`,
	"playbooks/router.md": ROUTER_TEXT,
	"skills/lead/SKILL.md": `---
name: lead
description: Use to take a design to a reviewed change
---

Start \`demo:plan\`, read its outcome, and follow the flow.
`,
};

/** Runs git in a folder, with an identity and dates of its own, and returns what it prints. */
export function git(dir: string, ...args: string[]): string {
	const env: Record<string, string | undefined> = {
		...process.env,
		GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
		GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
	};
	// Inside a git hook these point at the repository being committed to.
	for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
	const set = ["user.name=test", "user.email=test@example.com", "commit.gpgsign=false"];
	const run = Bun.spawnSync(
		[
			"git",
			"-C",
			dir,
			...set.flatMap((pair) => ["-c", pair]),
			"-c",
			"core.hooksPath=/dev/null",
			...args,
		],
		{ stdout: "pipe", stderr: "pipe", env },
	);
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
	return run.stdout.toString().trim();
}

const STORE_HEADER = `
id: alpha/store
source: { repo: example/alpha, commit: "1111111", path: docs/tasks.md }
kind: playbook
does: Keeps tasks as boxes in the plan file.
provides:
  TaskStorage:
    verbs:
      create: "Write each task as a \`- [ ]\` entry."
      mark-done: "Tick the box of the task."
    fingerprints: ["- [ ]"]
`;
const STORE_TEXT = "# Tasks\n\nA task is a `- [ ]` line of the plan file.\n";

/** The blocks of the stack `alpha`: its header, its files, and where they are in the repository. */
const STACK = {
	plan: {
		header: PLAN_HEADER,
		files: { "SKILL.md": PLAN_TEXT, "template.md": "# Plan\n\n- Goal\n- Steps\n" },
		at: (file: string) => `skills/plan/${file}`,
	},
	execute: {
		header: EXECUTE_HEADER,
		files: { "SKILL.md": EXECUTE_TEXT },
		at: (file: string) => `skills/execute/${file}`,
	},
	store: { header: STORE_HEADER, files: { "tasks.md": STORE_TEXT }, at: () => "docs/tasks.md" },
};
type Change = {
	header?: (header: string) => string;
	/** Changes the main file. */
	text?: (text: string) => string;
	/** Files added to the block or replaced in it. */
	files?: Record<string, string>;
};

/**
 * Writes the stack `alpha` as the catalog holds it, and a repository whose one commit is its
 * source. A block's change is in the source too, unless `source` says otherwise. Headers are
 * written with the commit `"1111111"`, which becomes the short form of the real one.
 */
export function stack(
	over: Partial<Record<keyof typeof STACK, Change>> & {
		yaml?: (yaml: string) => string;
		/** Files of the stack's folder, besides the blocks. */
		files?: Record<string, string | undefined>;
		/** Files of the repository, by their path in it. */
		source?: Record<string, string | undefined>;
	} = {},
): { dir: string; clone: string; commit: string; short: string } {
	const made: Record<string, { header: string; files: Record<string, string> }> = {};
	const source: Record<string, string | undefined> = {};
	for (const [name, original] of Object.entries(STACK)) {
		const change = over[name as keyof typeof STACK] ?? {};
		const [main = "", text = ""] = Object.entries(original.files)[0] ?? [];
		const files = { ...original.files, [main]: (change.text ?? same)(text), ...change.files };
		made[name] = { header: (change.header ?? same)(original.header), files };
		for (const [file, content] of Object.entries(files))
			source[original.at(file)] = unmarked(content);
	}
	const clone = write(temp(), { ...source, ...over.source });
	git(clone, "init", "--quiet");
	git(clone, "add", "--all");
	git(clone, "commit", "--quiet", "--message", "source");
	const commit = git(clone, "rev-parse", "HEAD");
	const short = commit.slice(0, 7);

	const dir = join(temp(), "alpha");
	const yaml = `repository: example/alpha\ncommit: "${commit}"\nlicence: MIT\nimported: 2026-11-22\n`;
	write(dir, {
		"stack.yaml": (over.yaml ?? same)(yaml),
		LICENSE: "MIT, alpha\n",
		"IMPORT-REPORT.md": "# Import report\n\nNothing was left unmapped.\n",
		...over.files,
	});
	for (const [name, { header, files }] of Object.entries(made))
		write(join(dir, name), block(header.replace('"1111111"', `"${short}"`), files));
	return { dir, clone, commit, short };
}

/** Writes an assembly folder: the careful one, with the given files replaced or left out. */
export const assembly = (over: Record<string, string | undefined> = {}): string =>
	write(temp(), { ...ASSEMBLY, ...over });

/** The careful assembly's `assembly.json`, with entries replaced or left out. */
export const listing = (over: Record<string, unknown>): string => {
	const files = { ...JSON.parse(ASSEMBLY["assembly.json"] ?? "{}").files, ...over };
	for (const [path, entry] of Object.entries(files)) if (entry === undefined) delete files[path];
	return JSON.stringify({ files });
};
