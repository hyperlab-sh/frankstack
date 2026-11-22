import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fingerprint, isObj, loadBlock } from "./block.ts";
import { isDir } from "./bundle.ts";
import { NAMED } from "./language.ts";
import type { Block, FileMark, Finding, Severity } from "./types.ts";

const STACK_KEYS = ["repository", "commit", "licence", "imported"];
/** Blocks of the stack that are not imported yet: the name of each and its path in the repository. */
const PENDING = "pending";

/** A path in the repository as git names it: no `./` in front, no `/` at the end. */
const inRepository = (path: string) => path.replace(/^\.\//, "").replace(/\/+$/, "");

/** Runs git in the clone; undefined when it fails. The output is one character per byte. */
function git(clone: string, ...args: string[]): string | undefined {
	// Inside a git hook these name the repository being committed to, and they win over `-C`.
	const env: Record<string, string | undefined> = { ...process.env };
	for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) delete env[key];
	const run = Bun.spawnSync(["git", "-C", clone, ...args], { stdout: "pipe", stderr: "pipe", env });
	return run.exitCode === 0 ? Buffer.from(run.stdout).toString("latin1") : undefined;
}

/** Whether a mark ties its passage to a provider: the assembler deals with what is inside it. */
const ties = (mark: FileMark, concept: string, provider: string) =>
	(mark.tag === "uses" && mark.attrs.concept === concept) ||
	(mark.tag === "concept" &&
		(mark.attrs.name === concept || NAMED.get(mark.attrs.name ?? "") === concept)) ||
	(mark.tag === "ref" && mark.attrs.to === provider);

/**
 * Checks one stack of the catalog against a clone of its repository: the folder is
 * `catalog/<stack>/`, with `stack.yaml` and one folder per block.
 */
export function checkCatalog(dir: string, clone: string): Finding[] {
	const findings: Finding[] = [];
	const add = (rule: string, message: string, severity: Severity = "error") => {
		findings.push({ rule, severity, message });
	};
	const stack = basename(resolve(dir));

	// The stack's own files.
	let pinned: { repository: string; commit: string } | undefined;
	const pending = new Map<string, string | undefined>();
	try {
		const doc: unknown = Bun.YAML.parse(readFileSync(join(dir, "stack.yaml"), "utf8"));
		if (!isObj(doc)) add("invalid", "`stack.yaml` must be a mapping");
		else {
			for (const key of Object.keys(doc)) {
				if (!STACK_KEYS.includes(key) && key !== PENDING)
					add("invalid", `\`stack.yaml\`: unknown key \`${key}\``);
			}
			for (const key of STACK_KEYS) {
				const value = doc[key];
				// An unquoted date is a date to some readers, and a commit of digits a number.
				if (key === "imported" ? value === undefined || value === null : typeof value !== "string")
					add(
						"invalid",
						`\`stack.yaml\`: \`${key}\` is missing${key === "commit" && value !== undefined ? " or not text: write the commit in quotes" : ""}`,
					);
			}
			if (typeof doc.repository === "string" && typeof doc.commit === "string")
				pinned = { repository: doc.repository, commit: doc.commit };
			const listed = doc[PENDING];
			if (isObj(listed)) {
				for (const [name, path] of Object.entries(listed)) {
					const given = typeof path === "string" && path !== "";
					pending.set(name, given ? path : undefined);
					if (!given)
						add(
							"invalid",
							`\`stack.yaml\`: \`${PENDING}.${name}\` must be the block's path in the repository`,
						);
				}
			} else if (listed !== undefined)
				add(
					"invalid",
					`\`stack.yaml\`: \`${PENDING}\` must map each block that is not imported yet to its path in the repository`,
				);
		}
	} catch (error) {
		add(
			"invalid",
			`\`stack.yaml\` is missing or not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	for (const file of ["LICENSE", "IMPORT-REPORT.md"]) {
		if (!Bun.file(join(dir, file)).size) add("missing-file", `\`${file}\` is missing or empty`);
	}

	// The commit the stack is pinned at, in the clone.
	const resolved = new Map<string, string | undefined>();
	const full = (commit: string) => {
		if (!resolved.has(commit))
			resolved.set(
				commit,
				git(clone, "rev-parse", "--verify", "--quiet", `${commit}^{commit}`)?.trim(),
			);
		return resolved.get(commit);
	};
	const at = pinned ? full(pinned.commit) : undefined;
	if (pinned && at === undefined)
		add(
			"missing-source",
			`\`${clone}\` has no commit \`${pinned.commit}\`: the files cannot be compared with their source`,
		);

	// Each block.
	let folders: string[] = [];
	try {
		folders = readdirSync(dir)
			.filter((name) => isDir(join(dir, name)))
			.sort();
	} catch {
		add("invalid", `\`${dir}\` cannot be read`);
	}
	if (folders.length === 0) add("invalid", "the stack has no block");
	for (const [name, path] of pending) {
		if (folders.includes(name))
			add(
				"invalid",
				`\`stack.yaml\`: \`${PENDING}\` lists \`${name}\`, which is imported: take it out of the list`,
			);
		else if (
			path !== undefined &&
			at !== undefined &&
			git(clone, "cat-file", "-e", `${at}:${inRepository(path)}`) === undefined
		)
			add(
				"unknown-block",
				`\`stack.yaml\`: \`${PENDING}.${name}\` is \`${path}\`, and the source has no such path at \`${pinned?.commit}\``,
			);
	}
	const blocks = new Map<string, Block>();
	for (const folder of folders) {
		const id = `${stack}/${folder}`;
		const label = `block \`${id}\``;
		const block = loadBlock(join(dir, folder), label);
		blocks.set(id, block);
		findings.push(...block.findings);
		const head = block.header;
		if (!head) continue;
		if (head.id === undefined || head.source === undefined) {
			add("bad-header", `${label}: a block of the catalog has \`id\` and \`source\``);
			continue;
		}
		if (head.id !== id)
			add(
				"wrong-block",
				`${label}: its header says \`${head.id}\`, and its folder is \`${folder}/\``,
			);
		const { repo, commit } = head.source;
		if (pinned && repo !== pinned.repository)
			add(
				"bad-header",
				`${label}: \`source.repo\` is \`${repo}\`, and the stack's repository is \`${pinned.repository}\``,
			);
		if (at === undefined) continue;
		if (full(commit) !== at) {
			add(
				"bad-header",
				`${label}: \`source.commit\` is \`${commit}\`, and the stack is pinned at \`${pinned?.commit}\``,
			);
			continue;
		}
		// `source.path` is the block's folder in the repository, or the file itself for a block of one file.
		const path = inRepository(head.source.path);
		const root = path === "" || path === ".";
		for (const [file, original] of block.originals) {
			const places = [root ? file : `${path}/${file}`];
			if (block.originals.size === 1 && !root) places.push(path);
			const sources = places
				.map((place) => ({ place, text: git(clone, "cat-file", "blob", `${at}:${place}`) }))
				.filter((source) => source.text !== undefined);
			if (sources.length === 0)
				add(
					"source-mismatch",
					`${label}: \`${file}\` is not in the source: there is no ${places.map((place) => `\`${place}\``).join(" or ")} at \`${commit}\``,
				);
			else if (!sources.some((source) => source.text === original))
				add(
					"source-mismatch",
					`${label}: \`${file}\` without its marks is not \`${sources[0]?.place}\` at \`${commit}\``,
				);
		}
	}

	// Every block a text points at is a block of this stack: one that is here, or one still to import.
	for (const [id, block] of blocks) {
		const to = new Map<string, string>();
		for (const reference of block.header?.references.keys() ?? [])
			to.set(reference, "`references`");
		for (const mark of block.marks) {
			if (mark.tag === "route" && mark.attrs.to)
				to.set(mark.attrs.to, `\`fs:route\` at ${mark.file}:${mark.line}`);
		}
		for (const [target, where] of to) {
			const name = target.startsWith(`${stack}/`) ? target.slice(stack.length + 1) : undefined;
			if (!blocks.has(target) && !(name !== undefined && pending.has(name)))
				add(
					"unknown-block",
					`block \`${id}\`: ${where} names \`${target}\`, which is not a block of \`${stack}\``,
				);
		}
	}

	// What betrays one of the stack's providers is inside a mark that ties the passage to it.
	for (const [provider, providing] of blocks) {
		for (const [concept, provides] of providing.header?.provides ?? []) {
			for (const [id, block] of blocks) {
				if (id === provider) continue;
				for (const [file, original] of block.originals) {
					const marks = block.marks.filter(
						(mark) => mark.file === file && ties(mark, concept, provider),
					);
					for (const betrays of provides.fingerprints) {
						if (betrays === "") continue;
						const bytes = Buffer.from(betrays, "utf8").toString("latin1");
						const lines = new Set<number>();
						for (const found of original.matchAll(fingerprint(bytes))) {
							const end = found.index + bytes.length;
							if (marks.some((mark) => mark.start <= found.index && end <= mark.end)) continue;
							const shift = file === block.main ? block.headerLines : 0;
							lines.add(original.slice(0, found.index).split("\n").length + shift);
						}
						if (lines.size > 0)
							add(
								"unmarked-fingerprint",
								`block \`${id}\`: ${file}:${[...lines].join(", ")}: \`${betrays}\` belongs to \`${provider}\` (\`${concept}\`) and is outside any mark that ties the passage to it`,
							);
					}
				}
			}
		}
	}
	return findings;
}
