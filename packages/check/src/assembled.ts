import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprint, isObj, loadBlock, norm, walk } from "./block.ts";
import { isDir, keeps, usesOf } from "./bundle.ts";
import { base } from "./flow.ts";
import { NAMED } from "./language.ts";
import { utf8 } from "./marks.ts";
import type { Bundle, BundleBlock, FileMark, Finding, Flat, Node, Severity } from "./types.ts";

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/;
/** What the assembler writes that comes from no block. */
const OWN = [
	"assembly.json",
	"ASSEMBLY-REPORT.md",
	".claude-plugin/plugin.json",
	"hooks/hooks.json",
];
const MANIFEST = ".claude-plugin/plugin.json";
/** How many changed passages of one file are listed one by one. */
const LISTED = 5;

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
/** A concept's name as ordinary words: `TaskId` is "task id". */
const ordinary = (concept: string) => concept.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const lineAt = (text: string, offset: number) => text.slice(0, offset).split("\n").length;

/** Top-level keys written twice in a frontmatter: YAML keeps one and says nothing. */
export function duplicateKeys(text: string): string[] {
	const seen = new Set<string>();
	const twice = new Set<string>();
	for (const line of (FRONT.exec(text)?.[1] ?? "").split(/\r?\n/)) {
		const key = /^([A-Za-z_][\w-]*):/.exec(line)?.[1];
		if (key === undefined) continue;
		if (seen.has(key)) twice.add(key);
		seen.add(key);
	}
	return [...twice];
}

/** What the assembly must have where a mark was. */
type Expect =
	/** The assembler's own text: nothing to compare it with. */
	| { kind: "any" }
	| { kind: "gone"; why: string }
	| { kind: "sentence"; sentence: string; name?: string; outcome?: string; what: string }
	| { kind: "contains"; text: string; what: string }
	| { kind: "renamed"; expected: string; what: string };

type Hole = { mark: FileMark; was: string; expect: Expect };
type Item = { phrase: string; line: number } | { hole: Hole };
type Cell = { flat: Flat; node: Node };

/** What the table of `docs/format.md` says about one mark; undefined when its text stays. */
function expectation(
	mark: FileMark,
	block: BundleBlock,
	bundle: Bundle,
	cells: Cell[],
): Expect | undefined {
	const { to = "", concept = "", verb, name = "", outcome = "" } = mark.attrs;
	const above = (tag: string) => {
		for (let at = mark.parent; at; at = at.parent) if (at.tag === tag) return at;
		return undefined;
	};
	const provider = (of: string) => {
		const choice = bundle.concepts.get(of);
		return choice && "block" in choice ? bundle.blocks.get(choice.block) : undefined;
	};
	const given = (slot: string) =>
		cells.flatMap(({ flat, node }) => {
			const artifact = node.inputs.get(slot) ?? node.outputs.get(slot);
			return artifact === undefined ? [] : [{ flat, artifact }];
		});
	switch (mark.tag) {
		case "ref":
			return block.references.get(to) === null
				? { kind: "gone", why: `the reference \`${to}\` is bound to null` }
				: undefined;
		case "name": {
			const reference = above("ref")?.attrs.to ?? "";
			const bound = block.references.get(reference);
			return typeof bound === "string"
				? {
						kind: "contains",
						text: bound,
						what: `the name of \`${bound}\`, which stands for \`${reference}\``,
					}
				: undefined;
		}
		case "uses": {
			if (keeps(bundle, concept, usesOf(block).get(concept)?.writtenFor)) return undefined;
			const other = provider(concept);
			const sentence = verb ? other?.def?.provides.get(concept)?.verbs.get(verb) : undefined;
			if (!other || sentence === undefined) return { kind: "any" };
			return {
				kind: "sentence",
				sentence,
				name: other.name,
				what: `the sentence of \`${other.name}\` for \`${concept}.${verb}\``,
			};
		}
		case "concept": {
			const owner = NAMED.get(name);
			if (!owner || block.def?.provides.has(owner)) return undefined;
			if (keeps(bundle, owner, block.def?.uses.get(owner)?.writtenFor)) return undefined;
			const other = provider(owner);
			const called = other?.def?.provides.get(owner)?.names.get(name);
			return {
				kind: "renamed",
				expected: called ?? ordinary(name),
				what: called
					? `\`${other?.name}\` calls a ${name} "${called}"`
					: `\`${other?.name}\` gives no name for ${name}, so the ordinary word goes there`,
			};
		}
		case "route": {
			const other = provider("Routing");
			if (!other) return undefined;
			const sentence = other.def?.provides.get("Routing")?.verbs.get("report");
			if (sentence === undefined) return { kind: "any" };
			return {
				kind: "sentence",
				sentence,
				name: other.name,
				outcome,
				what: `the sentence of \`${other.name}\` for reporting \`${outcome}\``,
			};
		}
		case "artifact": {
			// A block no cell uses is given no artifact by anyone: its text stays.
			if (cells.length === 0 || given(name).length > 0) return undefined;
			// A required input no cell gives is an error of the bundle, reported there.
			return block.def?.inputs.get(name)?.required
				? undefined
				: { kind: "gone", why: `no cell gives an artifact for \`${name}\`` };
		}
		case "path": {
			const slot = above("artifact")?.attrs.name ?? "";
			const places = given(slot).map(
				({ flat, artifact }) => flat.paths.get(artifact) ?? flat.paths.get(base(artifact)),
			);
			if (places.length === 0) return undefined;
			if (places.includes(undefined)) return { kind: "any" };
			const distinct = [...new Set(places as string[])];
			if (distinct.length > 1)
				return {
					kind: "contains",
					text: "the place the lead gives for",
					what: `"the place the lead gives for \`${slot}\`": the cells keep it in different places`,
				};
			const place = (distinct[0] ?? "").replace(/^\((.*)\)$/, "$1");
			return { kind: "contains", text: place, what: `the place of \`${slot}\`` };
		}
		default:
			return undefined;
	}
}

/** The source file as what must be found in the assembly, in order: phrases and what stands at each mark. */
function items(
	original: string,
	marks: FileMark[],
	expect: (mark: FileMark) => Expect | undefined,
) {
	const result: Item[] = [];
	const literal = (from: number, to: number) => {
		let at = from;
		for (const paragraph of original.slice(from, to).split(/(\r?\n[ \t]*\r?\n)/)) {
			const phrase = squash(utf8(paragraph));
			if (/[\p{L}\p{N}]/u.test(phrase)) {
				const lead = paragraph.length - paragraph.trimStart().length;
				result.push({ phrase, line: lineAt(original, at + lead) });
			}
			at += paragraph.length;
		}
	};
	// The frontmatter is the target's to write (the name the block is installed under): not compared.
	let pos = FRONT.exec(original)?.[0].length ?? 0;
	const holes = new Set<FileMark>();
	const inside = (mark: FileMark) => {
		for (let at = mark.parent; at; at = at.parent) if (holes.has(at as FileMark)) return true;
		return false;
	};
	for (const mark of marks) {
		if (mark.start < pos || inside(mark)) continue;
		const expected = expect(mark);
		if (!expected) continue;
		holes.add(mark);
		literal(pos, mark.start);
		result.push({
			hole: { mark, was: squash(utf8(original.slice(mark.start, mark.end))), expect: expected },
		});
		pos = mark.end;
	}
	literal(pos, original.length);
	return result;
}

/** Why what stands in the assembly where a mark was is not what the table says, if it is not. */
function wrong(hole: Hole, window: string): string | undefined {
	const { expect, was } = hole;
	switch (expect.kind) {
		case "any":
			return undefined;
		case "gone":
			// A short passage is only evidence when it is all there is between its neighbours.
			return was !== "" && (was.length >= 12 ? window.includes(was) : window === was)
				? `the passage should have been taken out: ${expect.why}`
				: undefined;
		case "sentence": {
			let at = 0;
			for (const part of expect.sentence.split(/\{name\}|\{outcome\}/).map(squash)) {
				const found = part === "" ? at : window.indexOf(part, at);
				if (found < 0) return `the passage should be ${expect.what}: "${expect.sentence}"`;
				at = found + part.length;
			}
			if (expect.sentence.includes("{name}") && expect.name && !window.includes(expect.name))
				return `the passage should be ${expect.what}, with the name \`${expect.name}\``;
			if (expect.outcome && !norm(window).includes(norm(expect.outcome)))
				return `the passage should be ${expect.what}, and never names the outcome`;
			// The provider's sentence beside the passage it replaces is two instructions for one thing.
			if (was.length >= 12 && window.includes(was) && !squash(expect.sentence).includes(was))
				return `the passage was kept beside ${expect.what}`;
			return undefined;
		}
		case "contains":
			return window.includes(squash(expect.text))
				? undefined
				: `the passage should have ${expect.what}`;
		case "renamed":
			return window === was && !was.toLowerCase().includes(expect.expected.toLowerCase())
				? `the passage still says "${was}": ${expect.what}`
				: undefined;
	}
}

/** Compares one file of the assembly with the block file it was written from. */
function compare(
	path: string,
	assembled: string,
	block: BundleBlock,
	file: string,
	bundle: Bundle,
	cells: Cell[],
): Finding[] {
	const findings: Finding[] = [];
	const loaded = block.loaded;
	const original = loaded?.originals.get(file);
	if (!loaded || original === undefined) return findings;
	const shift = file === loaded.main ? loaded.headerLines : 0;
	const from = (line: number) => `\`blocks/${block.name}/${file}\` line ${line + shift}`;
	const marks = loaded.marks.filter((mark) => mark.file === file);
	const list = items(original, marks, (mark) => expectation(mark, block, bundle, cells));
	const text = squash(assembled.replace(FRONT, ""));

	// Each phrase at the earliest place it can be, then at the latest: what lies between the two is
	// the most a mark between them can have become.
	const earliest: ({ start: number; end: number } | undefined)[] = [];
	let pos = 0;
	const missing: { phrase: string; line: number }[] = [];
	for (const item of list) {
		if ("hole" in item) {
			earliest.push(undefined);
			continue;
		}
		const start = text.indexOf(item.phrase, pos);
		if (start < 0) {
			missing.push(item);
			earliest.push(undefined);
			continue;
		}
		pos = start + item.phrase.length;
		earliest.push({ start, end: pos });
	}
	const latest: (number | undefined)[] = list.map(() => undefined);
	pos = text.length;
	for (let index = list.length - 1; index >= 0; index--) {
		const item = list[index];
		if (!item || "hole" in item || !earliest[index]) continue;
		const start = text.lastIndexOf(item.phrase, pos - item.phrase.length);
		latest[index] = start;
		pos = start;
	}
	for (const { phrase, line } of missing.slice(0, LISTED)) {
		const shown = phrase.length > 90 ? `${phrase.slice(0, 90)}…` : phrase;
		findings.push({
			rule: "changed-text",
			severity: "error",
			message: `\`${path}\`: text of ${from(line)} that no mark covers was changed, moved or removed: "${shown}"`,
		});
	}
	if (missing.length > LISTED)
		findings.push({
			rule: "changed-text",
			severity: "error",
			message: `\`${path}\`: ${missing.length - LISTED} more passages of \`blocks/${block.name}/${file}\` were changed, moved or removed`,
		});
	list.forEach((item, index) => {
		if (!("hole" in item)) return;
		let lo = 0;
		for (let before = index - 1; before >= 0; before--) {
			const end = earliest[before]?.end;
			if (end !== undefined) {
				lo = end;
				break;
			}
		}
		let hi = text.length;
		for (let after = index + 1; after < list.length; after++) {
			const start = latest[after];
			if (start !== undefined) {
				hi = start;
				break;
			}
		}
		const problem = wrong(item.hole, hi > lo ? text.slice(lo, hi).trim() : "");
		if (problem)
			findings.push({
				rule: "unhandled-mark",
				severity: "error",
				message: `\`${path}\`: \`fs:${item.hole.mark.tag}\` at \`blocks/${block.name}/${file}\` line ${item.hole.mark.line}: ${problem}`,
			});
	});
	return findings;
}

type Entry = { path: string; block: string; file?: string; origin?: "created" | "lead" };

/** Reads `assembly.json`: for each file written, the block and the file it came from, `created`, or `lead`. */
function entries(raw: string | undefined, add: (rule: string, message: string) => void): Entry[] {
	let doc: unknown;
	try {
		doc = JSON.parse(raw ?? "");
	} catch {
		add("missing-file", "`assembly.json` is missing or not valid JSON");
		return [];
	}
	if (!isObj(doc) || !isObj(doc.files)) {
		add("invalid", "`assembly.json` needs `files`: each file written, with its block");
		return [];
	}
	const result: Entry[] = [];
	for (const [path, value] of Object.entries(doc.files)) {
		const origin = isObj(value) ? value.origin : undefined;
		if (
			!isObj(value) ||
			typeof value.block !== "string" ||
			(typeof value.file === "string") === (origin !== undefined) ||
			(origin !== undefined && origin !== "created" && origin !== "lead")
		) {
			add(
				"invalid",
				`\`assembly.json\`: \`${path}\` needs \`block\`, and either \`file\` (the file of the block it came from) or \`origin\` (\`created\` or \`lead\`)`,
			);
			continue;
		}
		result.push({
			path,
			block: value.block,
			file: typeof value.file === "string" ? value.file : undefined,
			origin: origin === "created" || origin === "lead" ? origin : undefined,
		});
	}
	return result;
}

/**
 * Checks an assembly against the bundle it was written from. `catalog` is the folder of the
 * catalog: with it the check also looks for what is left of the providers the bundle replaced.
 */
export function checkAssembled(
	dir: string,
	bundle: Bundle,
	bundleDir: string,
	catalog?: string,
): Finding[] {
	const findings: Finding[] = [];
	const add = (rule: string, message: string, severity: Severity = "error") => {
		findings.push({ rule, severity, message });
	};
	const files = walk(dir);
	const text = new Map(files.map((file) => [file, readFileSync(join(dir, file), "utf8")]));
	const own = (path: string) => OWN.includes(path) || path.startsWith("LICENSES/");

	// A tag left behind.
	for (const [path, body] of text) {
		if (path === "assembly.json" || path === "ASSEMBLY-REPORT.md" || path.startsWith("LICENSES/"))
			continue;
		const lines = body
			.split("\n")
			.flatMap((line, index) => (/<\/?fs:/.test(line) ? [index + 1] : []));
		if (lines.length > 0)
			add(
				"leftover-tag",
				`\`${path}\` line ${lines.join(", ")}: a \`fs:\` tag was left in the text`,
			);
	}

	// What the assembler writes besides the blocks.
	if (!text.has("ASSEMBLY-REPORT.md")) add("missing-file", "`ASSEMBLY-REPORT.md` is missing");
	for (const licence of walk(join(bundleDir, "licenses"))) {
		if (!text.has(`LICENSES/${licence}`))
			add("missing-file", `\`LICENSES/${licence}\` is missing: the licences go with the blocks`);
	}

	// Which file came from which block.
	const listed = entries(text.get("assembly.json"), add);
	const cells = new Map<string, Cell[]>();
	const leads = new Set(bundle.flows.map((flat) => flat.lead));
	for (const flat of bundle.flows) {
		for (const node of flat.nodes.values()) {
			if (node.block) cells.set(node.block, [...(cells.get(node.block) ?? []), { flat, node }]);
		}
	}
	const written = new Map<string, Entry[]>();
	for (const entry of listed) {
		const block = bundle.blocks.get(entry.block);
		if (!text.has(entry.path)) {
			add(
				"missing-file",
				`\`assembly.json\` lists \`${entry.path}\`, which is not in the assembly`,
			);
			continue;
		}
		if (!block) {
			add(
				"unknown-block",
				`\`assembly.json\`: \`${entry.path}\` names block \`${entry.block}\`, which the bundle does not have`,
			);
			continue;
		}
		const wants = block.origin !== "created" ? "file" : leads.has(block.name) ? "lead" : "created";
		if ((entry.origin ?? "file") !== wants) {
			add(
				"invalid",
				`\`assembly.json\`: \`${entry.path}\` is given as ${entry.origin ? `\`origin: ${entry.origin}\`` : "written from a file"}, and block \`${block.name}\` is ${wants === "file" ? "a block with files: name the file it came from" : `\`${wants}\``}`,
			);
			continue;
		}
		if (entry.file !== undefined && !block.loaded?.originals.has(entry.file)) {
			add(
				"invalid",
				`\`assembly.json\`: \`${entry.path}\` came from \`${entry.file}\`, which is not a file of block \`${block.name}\``,
			);
			continue;
		}
		written.set(block.name, [...(written.get(block.name) ?? []), entry]);
		if (entry.file !== undefined)
			findings.push(
				...compare(
					entry.path,
					text.get(entry.path) ?? "",
					block,
					entry.file,
					bundle,
					cells.get(block.name) ?? [],
				),
			);
	}
	for (const block of bundle.blocks.values()) {
		const from = written.get(block.name) ?? [];
		if (block.origin === "created") {
			if (from.length === 0)
				add(
					"not-written",
					leads.has(block.name)
						? `the lead \`${block.name}\` was not written`
						: `the created block \`${block.name}\` was not written`,
				);
			continue;
		}
		for (const file of block.loaded?.originals.keys() ?? []) {
			if (!from.some((entry) => entry.file === file))
				add("not-written", `\`${file}\` of block \`${block.name}\` was not written`);
		}
	}
	const known = new Set(listed.map((entry) => entry.path));
	for (const path of files) {
		if (!own(path) && !known.has(path))
			add("unlisted-file", `\`${path}\` is not listed in \`assembly.json\``, "warning");
	}

	// Frontmatter of skills and agents.
	const main = new Map<string, string>();
	for (const entry of listed) {
		const block = bundle.blocks.get(entry.block);
		if (entry.file !== undefined && entry.file === block?.loaded?.main)
			main.set(entry.path, entry.block);
	}
	const names = new Map<string, string>();
	for (const [path, body] of text) {
		const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1];
		const agent = /^agents\/([^/]+)\.md$/.exec(path)?.[1];
		if (!skill && !agent) continue;
		const front = FRONT.exec(body)?.[1];
		let data: unknown;
		try {
			data = front === undefined ? undefined : Bun.YAML.parse(front);
		} catch {
			data = undefined;
		}
		if (
			!isObj(data) ||
			typeof data.name !== "string" ||
			typeof data.description !== "string" ||
			data.description.trim() === ""
		) {
			add("bad-frontmatter", `\`${path}\` needs frontmatter with \`name\` and \`description\``);
			continue;
		}
		for (const key of duplicateKeys(body))
			add("bad-frontmatter", `\`${path}\` gives \`${key}\` twice in its frontmatter`);
		if (data.name !== (skill ?? agent))
			add("bad-frontmatter", `\`${path}\` is named \`${data.name}\` in its frontmatter`);
		const installed = main.get(path);
		if (installed !== undefined && data.name !== installed)
			add(
				"bad-frontmatter",
				`\`${path}\` is the main file of block \`${installed}\`, and its frontmatter names it \`${data.name}\``,
			);
		const kind = skill ? "skill" : "agent";
		const other = names.get(`${kind} ${data.name}`);
		if (other)
			add("bad-frontmatter", `\`${path}\` and \`${other}\` are both the ${kind} \`${data.name}\``);
		names.set(`${kind} ${data.name}`, path);
	}

	// Names that lead nowhere.
	let plugin: string | undefined;
	try {
		const manifest: unknown = JSON.parse(text.get(MANIFEST) ?? "");
		plugin = isObj(manifest) && typeof manifest.name === "string" ? manifest.name : undefined;
	} catch {
		plugin = undefined;
	}
	if (plugin === undefined) add("missing-file", `\`${MANIFEST}\` is missing or has no \`name\``);
	else {
		for (const [path, body] of text) {
			if (own(path)) continue;
			body.split("\n").forEach((line, index) => {
				for (const match of line.matchAll(/(?<![\w/.-])([a-z][\w-]*):([a-z][\w-]*)(?![\w-]*\/)/g)) {
					if (match[1] === plugin && !bundle.blocks.has(match[2] ?? ""))
						add(
							"unresolved-name",
							`\`${path}\` line ${index + 1}: \`${match[0]}\` is no block of this bundle`,
						);
				}
			});
		}
	}

	// A block a cell uses reports its outcome the way the block that provides `Routing` says.
	const routing = bundle.concepts.get("Routing");
	const router = routing && "block" in routing ? bundle.blocks.get(routing.block) : undefined;
	const reports = router?.def?.provides.get("Routing");
	const sentence = reports?.verbs.get("report");
	const longest = (sentence ?? "")
		.split(/\{name\}|\{outcome\}/)
		.map(squash)
		.sort((a, b) => b.length - a.length)[0];
	const evidence = reports?.fingerprints.length
		? reports.fingerprints.map(squash)
		: [longest ?? ""];
	if (evidence.some((mark) => mark !== "")) {
		for (const [name, used] of cells) {
			const def = bundle.blocks.get(name)?.def;
			const ends = used.some(
				({ node }) => ((node.part ? def?.parts.get(node.part) : def?.outcomes) ?? []).length > 0,
			);
			const bodies = (written.get(name) ?? []).map((entry) => squash(text.get(entry.path) ?? ""));
			if (!ends || name === router?.name || bodies.length === 0) continue;
			if (!bodies.some((body) => evidence.some((mark) => mark !== "" && body.includes(mark))))
				add(
					"missing-outcome",
					`block \`${name}\` is used by ${used.map(({ node }) => node.id).join(", ")} and never says how to report an outcome (\`${router?.name}\`: "${sentence ?? evidence[0]}")`,
				);
		}
	}

	// What is left of the providers the bundle does not use.
	const replaced = new Map<string, { concept: string; fingerprints: string[]; block?: string }>();
	for (const block of bundle.blocks.values()) {
		for (const [concept, provides] of block.def?.provides ?? []) {
			const choice = bundle.concepts.get(concept);
			if (choice && "block" in choice && choice.block !== block.name)
				replaced.set(`${block.name} ${concept}`, {
					concept,
					fingerprints: provides.fingerprints,
					block: block.name,
				});
		}
	}
	const absent = new Map<string, string>();
	for (const block of bundle.blocks.values()) {
		for (const [concept, use] of usesOf(block)) {
			const id = use.writtenFor;
			if (id?.includes("/") && !keeps(bundle, concept, id)) absent.set(`${id} ${concept}`, id);
		}
	}
	for (const [key, id] of absent) {
		const concept = key.slice(id.length + 1);
		if ([...bundle.blocks.values()].some((block) => block.from === id)) continue;
		const folder = catalog === undefined ? undefined : join(catalog, id);
		if (folder === undefined || !isDir(folder)) {
			add(
				"fingerprints-not-checked",
				catalog === undefined
					? `the bundle replaces \`${id}\` for \`${concept}\`, which is not in the bundle: give \`--catalog <folder>\` to look for what is left of it`
					: `the bundle replaces \`${id}\` for \`${concept}\`, and \`${folder}\` is not in the catalog`,
				"warning",
			);
			continue;
		}
		const provides = loadBlock(folder, id).header?.provides.get(concept);
		if (provides) replaced.set(key, { concept, fingerprints: provides.fingerprints });
	}
	for (const [key, { concept, fingerprints, block }] of replaced) {
		const provider = block ?? key.split(" ")[0];
		for (const entry of listed) {
			if (entry.block === block) continue;
			const lines = (text.get(entry.path) ?? "").split("\n");
			for (const betrays of fingerprints) {
				if (betrays === "") continue;
				const pattern = fingerprint(betrays);
				const hits = lines.flatMap((line, index) => (line.search(pattern) >= 0 ? [index + 1] : []));
				if (hits.length > 0)
					add(
						"leftover-fingerprint",
						`\`${entry.path}\` line ${hits.join(", ")}: \`${betrays}\` belongs to \`${provider}\`, which does not provide \`${concept}\` in this bundle (the import missed a mark, or a passage was kept)`,
						"warning",
					);
			}
		}
	}
	return findings;
}
