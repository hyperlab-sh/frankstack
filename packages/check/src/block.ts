import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	ARTIFACT_KINDS,
	BLOCK_KINDS,
	HARNESS,
	isConcept,
	NAMED,
	PROVIDED,
	traitsOf,
	verbsOf,
} from "./language.ts";
import { scan, utf8 } from "./marks.ts";
import type {
	Block,
	Definition,
	FileMark,
	Finding,
	Header,
	Io,
	Name,
	Provide,
	Severity,
	Use,
} from "./types.ts";

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj =>
	typeof v === "object" && v !== null && !Array.isArray(v);
export const strs = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
/** Outcomes are compared without regard to case, `_` and `-`. */
export const norm = (outcome: string) => outcome.toLowerCase().replaceAll("_", "-");
/** The SHA-256 of a text held one character per byte. */
export const sha256 = (bytes: string) =>
	new Bun.CryptoHasher("sha256").update(Buffer.from(bytes, "latin1")).digest("hex");

/**
 * Finds a provider's fingerprint in a text: as a whole word on each side where it starts or ends
 * with a word character, so that `bd` is not found in `abd` and `"bd "` keeps its space.
 */
export const fingerprint = (text: string): RegExp => {
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`${/^\w/.test(text) ? "(?<![\\w-])" : ""}${escaped}${/\w$/.test(text) ? "(?![\\w-])" : ""}`,
		"g",
	);
};

/** Every file under `dir`, as paths relative to it. */
export function walk(dir: string, prefix = ""): string[] {
	let names: string[];
	try {
		names = readdirSync(join(dir, prefix)).sort();
	} catch {
		return [];
	}
	return names.flatMap((name) => {
		const path = prefix ? `${prefix}/${name}` : name;
		return statSync(join(dir, path)).isDirectory() ? walk(dir, path) : [path];
	});
}

export const DEFINITION_KEYS = [
	"kind",
	"does",
	"references",
	"uses",
	"provides",
	"inputs",
	"outputs",
	"outcomes",
	"parts",
];
const HEADER_KEYS = [...DEFINITION_KEYS, "id", "source", "files", "assumes"];

type Report = (rule: string, message: string, severity?: Severity) => void;

/** Reads the keys a block header and the entry of a created block share. */
export function definition(raw: Obj, report: Report): Definition {
	const bad = (message: string) => report("bad-header", message);
	const each = (key: string): [string, unknown][] => {
		const value = raw[key];
		if (value === undefined || value === null) return [];
		if (!isObj(value)) {
			bad(`\`${key}\` must be a mapping`);
			return [];
		}
		return Object.entries(value);
	};
	const list = (value: unknown, where: string): string[] => {
		if (value === undefined || value === null) return [];
		if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
			bad(`\`${where}\` must be a list of names`);
			return [];
		}
		return strs(value);
	};
	const ios = (key: string, what: string): Map<string, Io> => {
		const result = new Map<string, Io>();
		for (const [name, value] of each(key)) {
			if (!isObj(value) || typeof value.kind !== "string") {
				bad(`${what} \`${name}\` needs \`kind\``);
				continue;
			}
			result.set(name, { kind: value.kind, required: value.required === true });
		}
		return result;
	};
	const outcomes = (value: unknown, where: string): string[] => {
		if (value === undefined || value === null) return [];
		if (!isObj(value)) {
			bad(`\`${where}\` must map each outcome to a sentence`);
			return [];
		}
		return Object.keys(value);
	};

	if (typeof raw.kind !== "string") bad("`kind` is missing");
	if (typeof raw.does !== "string" || raw.does.trim() === "") bad("`does` is missing");

	const uses = new Map<string, Use>();
	for (const [concept, value] of each("uses")) {
		if (!isObj(value)) {
			bad(`\`uses.${concept}\` must be a mapping`);
			continue;
		}
		uses.set(concept, {
			writtenFor: typeof value["written-for"] === "string" ? value["written-for"] : undefined,
			verbs: list(value.verbs, `uses.${concept}.verbs`),
			names: list(value.names, `uses.${concept}.names`),
			needs: list(value.needs, `uses.${concept}.needs`),
		});
	}

	const provides = new Map<string, Provide>();
	for (const [concept, value] of each("provides")) {
		if (!isObj(value)) {
			bad(`\`provides.${concept}\` must be a mapping`);
			continue;
		}
		const verbs = new Map<string, string | undefined>();
		if (Array.isArray(value.verbs)) {
			for (const verb of list(value.verbs, `provides.${concept}.verbs`)) verbs.set(verb, undefined);
		} else if (isObj(value.verbs)) {
			for (const [verb, sentence] of Object.entries(value.verbs)) {
				if (typeof sentence !== "string" || sentence.trim() === "")
					bad(`\`provides.${concept}.verbs.${verb}\` must be a sentence`);
				else verbs.set(verb, sentence);
			}
		} else if (value.verbs !== undefined && value.verbs !== null)
			bad(`\`provides.${concept}.verbs\` must map each verb to a sentence`);
		const names = new Map<string, Name>();
		const said = (word: unknown): word is string => typeof word === "string" && word.trim() !== "";
		for (const [name, word] of Object.entries(isObj(value.names) ? value.names : {})) {
			const one = isObj(word) ? word.one : word;
			const many = isObj(word) ? word.many : undefined;
			const known =
				!isObj(word) || Object.keys(word).every((key) => key === "one" || key === "many");
			if (!known || !said(one) || (many !== undefined && !said(many)))
				bad(
					`\`provides.${concept}.names.${name}\` must be the provider's word for it, or \`{ one: <word>, many: <word> }\``,
				);
			else names.set(name, many === undefined ? { one } : { one, many });
		}
		provides.set(concept, {
			verbs,
			names,
			traits: list(value.traits, `provides.${concept}.traits`),
			fingerprints: list(value.fingerprints, `provides.${concept}.fingerprints`),
		});
	}

	const parts = new Map<string, string[]>();
	for (const [part, value] of each("parts")) {
		parts.set(part, outcomes(isObj(value) ? value.outcomes : undefined, `parts.${part}.outcomes`));
	}

	return {
		kind: typeof raw.kind === "string" ? raw.kind : "",
		does: typeof raw.does === "string" ? raw.does : "",
		references: ios("references", "reference"),
		uses,
		provides,
		inputs: ios("inputs", "input"),
		outputs: ios("outputs", "output"),
		outcomes: outcomes(raw.outcomes, "outcomes"),
		parts,
	};
}

/** Reports every kind, concept, verb and trait of a definition that the language does not have. */
export function terms(def: Definition, report: Report) {
	const unknown = (message: string) => report("unknown-term", message);
	if (def.kind && !BLOCK_KINDS.includes(def.kind)) unknown(`\`${def.kind}\` is not a block kind`);
	for (const [id, reference] of def.references) {
		if (!BLOCK_KINDS.includes(reference.kind))
			unknown(`reference \`${id}\`: \`${reference.kind}\` is not a block kind`);
	}
	for (const [what, ios] of [
		["input", def.inputs],
		["output", def.outputs],
	] as const) {
		for (const [name, io] of ios) {
			if (!ARTIFACT_KINDS.includes(io.kind))
				unknown(`${what} \`${name}\`: \`${io.kind}\` is not an artifact kind`);
		}
	}
	for (const [concept, use] of def.uses) {
		const verbs = verbsOf(concept);
		if (!verbs) {
			unknown(`\`uses\`: \`${concept}\` is not a concept a block provides`);
			continue;
		}
		for (const verb of use.verbs) {
			if (!verbs.includes(verb)) unknown(`\`${concept}\` has no verb \`${verb}\``);
		}
		for (const trait of use.needs) {
			if (!traitsOf(concept)?.includes(trait)) unknown(`\`${concept}\` has no trait \`${trait}\``);
		}
		for (const name of use.names) {
			if (NAMED.get(name) !== concept)
				unknown(`\`${name}\` is not a concept the provider of \`${concept}\` names`);
		}
	}
	for (const [concept, provide] of def.provides) {
		const known = PROVIDED.get(concept);
		if (!known) {
			unknown(
				concept === HARNESS
					? `\`${HARNESS}\` is settled by the target; no block provides it`
					: `\`provides\`: \`${concept}\` is not a concept a block provides`,
			);
			continue;
		}
		for (const verb of provide.verbs.keys()) {
			if (!known.verbs.includes(verb)) unknown(`\`${concept}\` has no verb \`${verb}\``);
		}
		for (const trait of provide.traits) {
			if (!known.traits.includes(trait)) unknown(`\`${concept}\` has no trait \`${trait}\``);
		}
		for (const name of provide.names.keys()) {
			if (NAMED.get(name) !== concept)
				unknown(`\`${name}\` is not a concept the provider of \`${concept}\` names`);
		}
	}
}

function header(text: string, report: Report): Header | undefined {
	let raw: unknown;
	try {
		raw = Bun.YAML.parse(text);
	} catch (error) {
		report(
			"bad-header",
			`the header is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
		return undefined;
	}
	if (!isObj(raw)) {
		report("bad-header", "the header must be a mapping");
		return undefined;
	}
	for (const key of Object.keys(raw)) {
		if (!HEADER_KEYS.includes(key)) report("bad-header", `unknown header key \`${key}\``);
	}
	const def = definition(raw, report);
	const files = new Map<string, string>();
	for (const [file, hash] of Object.entries(isObj(raw.files) ? raw.files : {})) {
		if (typeof hash === "string") files.set(file, hash.toLowerCase());
		else report("bad-header", `\`files.${file}\` must be the SHA-256 of the original file`);
	}
	if (files.size === 0) report("bad-header", "`files` must list every file of the block");
	const source = raw.source;
	if (source !== undefined) {
		if (
			!isObj(source) ||
			typeof source.repo !== "string" ||
			typeof source.commit !== "string" ||
			typeof source.path !== "string"
		)
			report("bad-header", "`source` needs `repo`, `commit` and `path`");
	}
	if (raw.id !== undefined && (typeof raw.id !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(raw.id)))
		report("bad-header", "`id` must be `<stack>/<block>`");
	if (raw.id === undefined && source !== undefined)
		report("bad-header", "`source` needs `id`: only a block of a stack says where its files are");
	return {
		...def,
		id: typeof raw.id === "string" ? raw.id : undefined,
		source: isObj(source)
			? { repo: String(source.repo), commit: String(source.commit), path: String(source.path) }
			: undefined,
		files,
	};
}

/** Reports where the header and the marks of a block disagree. */
function agree(head: Header, marks: FileMark[], originals: Map<string, string>, report: Report) {
	const at = (mark: FileMark) => `${mark.file}:${mark.line}`;
	/** What a mark covers besides the names inside it. */
	const around = (mark: FileMark) => {
		const text = originals.get(mark.file) ?? "";
		let rest = "";
		let pos = mark.start;
		for (const name of marks) {
			if (name.tag !== "name" || name.parent !== mark) continue;
			rest += text.slice(pos, name.start);
			pos = name.end;
		}
		return pos === mark.start ? undefined : rest + text.slice(pos, mark.end);
	};
	/** Whether a mark holds a name and nothing that makes it a passage: no word, no brackets of its own. */
	const nameAlone = (mark: FileMark) => {
		const rest = around(mark)?.trim();
		return rest !== undefined && !/[\p{L}\p{N}]/u.test(rest) && !/^[([].*[)\]]$/s.test(rest);
	};
	const undeclared = (mark: FileMark, message: string) =>
		report("undeclared-name", `${at(mark)}: ${message}`);
	const outcomes = new Set(
		[...head.outcomes, ...[...head.parts.values()].flat()].map((outcome) => norm(outcome)),
	);
	const seen = { refs: new Set<string>(), verbs: new Set<string>(), names: new Set<string>() };
	const parts = new Set<string>();
	for (const mark of marks) {
		const { to = "", concept = "", verb, name = "", outcome = "" } = mark.attrs;
		switch (mark.tag) {
			case "ref":
				seen.refs.add(to);
				if (to && !head.references.has(to))
					undeclared(mark, `\`fs:ref\` names \`${to}\`, which is not under \`references\``);
				// Bound to nothing, the passage is taken out: a mark over the name alone leaves a hole.
				else if (head.references.get(to)?.required === false && nameAlone(mark))
					report(
						"narrow-mark",
						`${at(mark)}: \`fs:ref\` to \`${to}\`, which is optional, covers only its name: when nothing stands for it the sentence around is left with a hole. Mark all the text that only makes sense when the block is there`,
						"warning",
					);
				break;
			case "uses": {
				const use = head.uses.get(concept);
				if (verb !== undefined) seen.verbs.add(`${concept}.${verb}`);
				if (!concept) break;
				if (!use) undeclared(mark, `\`fs:uses\` names \`${concept}\`, which is not under \`uses\``);
				else if (verb !== undefined && !use.verbs.includes(verb))
					undeclared(
						mark,
						`\`fs:uses\` does \`${verb}\`, which is not under \`uses.${concept}.verbs\``,
					);
				break;
			}
			case "concept": {
				seen.names.add(name);
				if (!name) break;
				if (!isConcept(name)) {
					report("unknown-term", `${at(mark)}: \`${name}\` is not a concept of the language`);
					break;
				}
				const owner = NAMED.get(name);
				if (
					owner &&
					!head.uses.get(owner)?.names.includes(name) &&
					!head.provides.get(owner)?.names.has(name)
				)
					undeclared(
						mark,
						`\`fs:concept\` names \`${name}\`, which is not under \`uses.${owner}.names\``,
					);
				break;
			}
			case "route":
				if (outcome && !outcomes.has(norm(outcome)))
					undeclared(
						mark,
						`\`fs:route\` stands for \`${outcome}\`, which is not under \`outcomes\``,
					);
				break;
			case "artifact":
				if (name && !head.inputs.has(name) && !head.outputs.has(name))
					undeclared(
						mark,
						`\`fs:artifact\` names \`${name}\`, which is neither an input nor an output`,
					);
				break;
			case "part":
				parts.add(name);
				if (name && !head.parts.has(name))
					undeclared(mark, `\`fs:part\` names \`${name}\`, which is not under \`parts\``);
				break;
		}
	}
	const unmarked = (message: string) => report("unmarked-name", message);
	for (const id of head.references.keys()) {
		if (!seen.refs.has(id)) unmarked(`reference \`${id}\` is declared and no \`fs:ref\` names it`);
	}
	for (const [concept, use] of head.uses) {
		for (const verb of use.verbs) {
			if (!seen.verbs.has(`${concept}.${verb}`))
				unmarked(`\`uses.${concept}.verbs\` lists \`${verb}\` and no \`fs:uses\` does it`);
		}
		for (const name of use.names) {
			if (!seen.names.has(name))
				unmarked(`\`uses.${concept}.names\` lists \`${name}\` and no \`fs:concept\` names it`);
		}
	}
	for (const part of head.parts.keys()) {
		if (!parts.has(part)) unmarked(`part \`${part}\` is declared and no \`fs:part\` marks it`);
	}
}

/**
 * Reads a block from its files (name to content, one character per byte). `label` starts every
 * message, so a reader knows which block it is about.
 */
export function readBlock(files: Map<string, string>, label: string): Block {
	const findings: Finding[] = [];
	const report: Report = (rule, message, severity = "error") => {
		findings.push({ rule, severity, message: `${label}: ${message}` });
	};
	const originals = new Map<string, string>();
	const marks: FileMark[] = [];
	const headers: [string, string, number][] = [];
	for (const [file, text] of files) {
		const scanned = scan(text);
		for (const problem of scanned.problems)
			report("bad-mark", `${file}:${problem.line}: ${problem.message}`);
		originals.set(file, scanned.original);
		for (const mark of scanned.marks) marks.push(Object.assign(mark, { file }));
		if (scanned.header !== undefined) headers.push([file, scanned.header, scanned.headerLines]);
	}
	const [main, text, headerLines = 0] = headers[0] ?? [];
	if (main === undefined || text === undefined) {
		report("bad-header", "no file starts with the header `<fs:block>`");
		return { headerLines, originals, marks, findings };
	}
	if (headers.length > 1)
		report(
			"bad-header",
			`more than one file starts with a header: ${headers.map(([file]) => file).join(", ")}`,
		);
	const head = header(utf8(text), report);
	if (!head) return { main, headerLines, originals, marks, findings };
	terms(head, report);
	for (const [file, original] of originals) {
		const expected = head.files.get(file);
		if (expected === undefined)
			report("unlisted-file", `\`${file}\` is not listed under \`files\``);
		else if (sha256(original) !== expected)
			report(
				"hash-mismatch",
				`\`${file}\` without its marks is not the original file (SHA-256 ${sha256(original)}, the header says ${expected})`,
			);
	}
	for (const file of head.files.keys()) {
		if (!originals.has(file))
			report("missing-file", `\`${file}\` is listed under \`files\` and is not in the folder`);
	}
	agree(head, marks, originals, report);
	return { header: head, main, headerLines, originals, marks, findings };
}

/** Reads the folder of a block. */
export function loadBlock(dir: string, label: string): Block {
	const files = new Map<string, string>();
	for (const file of walk(dir)) files.set(file, readFileSync(join(dir, file)).toString("latin1"));
	return readBlock(files, label);
}

/** The stack a block was taken from, when it has one. */
export const stackOf = (block: Block | undefined): string | undefined =>
	block?.header?.id?.split("/")[0];
