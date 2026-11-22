import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "./analyze.ts";
import { definition, isObj, loadBlock, stackOf, terms } from "./block.ts";
import { loadFlow } from "./flow.ts";
import { ARTIFACT_KINDS, HARNESS, PROVIDED, TARGETS, traitsOf, verbsOf } from "./language.ts";
import type { Bundle, BundleBlock, Choice, Finding, Flat, Severity, Use } from "./types.ts";

const TOP_KEYS = ["name", "description", "target", "concepts", "artifacts", "blocks", "flows"];
const ENTRY_KEYS = ["from", "origin", "references", "event", "instructions"];
/** The keys of a block header that the entry of a created block takes. */
const CREATED_KEYS = ["kind", "does", "provides", "uses", "inputs", "outputs", "outcomes"];

export type LoadedBundle = { dir: string; bundle?: Bundle; findings: Finding[] };

export const isDir = (path: string) =>
	statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;

/**
 * Keys written twice directly under one top-level key. A YAML reader keeps the last and says
 * nothing, so a second block of the same name would replace the first unseen.
 */
export function repeated(text: string, section: string): string[] {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => new RegExp(`^${section}:\\s*(#.*)?$`).test(line));
	if (start < 0) return [];
	let indent: number | undefined;
	const seen = new Set<string>();
	const twice = new Set<string>();
	for (const line of lines.slice(start + 1)) {
		if (/^\s*(#.*)?$/.test(line)) continue;
		const depth = line.length - line.trimStart().length;
		if (depth === 0) break;
		indent ??= depth;
		if (depth !== indent) continue;
		const key = /^\s+(?:"([^"]+)"|'([^']+)'|([^\s:#"'][^:]*?))\s*:(\s|$)/.exec(line);
		const name = key?.[1] ?? key?.[2] ?? key?.[3];
		if (name === undefined) continue;
		if (seen.has(name)) twice.add(name);
		seen.add(name);
	}
	return [...twice];
}

/** Whether the bundle keeps what a text was written for: the provider it names is the one chosen. */
export function keeps(bundle: Bundle, concept: string, writtenFor: string | undefined): boolean {
	const choice = bundle.concepts.get(concept);
	if (!choice) return true;
	if ("asWritten" in choice) return true;
	const provider = bundle.blocks.get(choice.block);
	return provider?.from !== undefined && provider.from === writtenFor;
}

/** What a block's text relies on, with the routing its marks imply. */
export function usesOf(block: BundleBlock): Map<string, Use> {
	const uses = new Map(block.def?.uses);
	// A text that passes control relies on Routing, whether or not its header says so.
	if (!uses.has("Routing") && block.loaded?.marks.some((mark) => mark.tag === "route"))
		uses.set("Routing", { writtenFor: stackOf(block.loaded), verbs: [], names: [], needs: [] });
	return uses;
}

/** Checks one use of a concept against what the bundle chose for it. */
function checkUse(
	bundle: Pick<Bundle, "target" | "concepts" | "blocks">,
	concept: string,
	use: Use,
	who: string,
	created: boolean,
): Finding[] {
	const findings: Finding[] = [];
	const add = (rule: string, message: string, severity: Severity = "error") => {
		findings.push({ rule, severity, message });
	};
	if (concept === HARNESS) {
		const has = TARGETS.get(bundle.target) ?? [];
		for (const trait of use.needs) {
			if (!has.includes(trait))
				add(
					"missing-trait",
					`${who} needs \`${HARNESS}.${trait}\`, which the target \`${bundle.target}\` does not have`,
				);
		}
		return findings;
	}
	if (!PROVIDED.has(concept)) return findings;
	const choice = bundle.concepts.get(concept);
	if (!choice) {
		add("no-provider", `${who} uses \`${concept}\`, and \`concepts\` has no entry for it`);
		return findings;
	}
	if ("asWritten" in choice) {
		const entry = `\`concepts.${concept}\` is \`as-written: ${choice.asWritten}\``;
		if (created)
			add(
				"not-as-written",
				`${entry}, and ${who} is written by the assembler, which has no block that says how \`${choice.asWritten}\` does it`,
			);
		else if (use.writtenFor !== choice.asWritten)
			add(
				"not-as-written",
				`${entry}, and ${who} was written for ${use.writtenFor ? `\`${use.writtenFor}\`` : "no stack its header names"}`,
			);
		return findings;
	}
	const provides = bundle.blocks.get(choice.block)?.def?.provides.get(concept);
	if (!provides) return findings;
	for (const verb of use.verbs) {
		if (!provides.verbs.has(verb))
			add(
				"missing-verb",
				`${who} does \`${concept}.${verb}\`, which \`${choice.block}\` has no sentence for`,
			);
	}
	for (const trait of use.needs) {
		if (!provides.traits.includes(trait))
			add(
				"missing-trait",
				`${who} needs \`${concept}.${trait}\`, which \`${choice.block}\` does not have`,
			);
	}
	for (const name of use.names) {
		if (!provides.names.has(name))
			add(
				"unnamed-concept",
				`${who} names \`${name}\`, and \`${choice.block}\` gives no name for it: the assembler writes the ordinary word`,
				"warning",
			);
	}
	return findings;
}

/** Reads a bundle folder and checks its blocks, its choices and each of its flows. */
export function loadBundle(dir: string): LoadedBundle {
	const findings: Finding[] = [];
	const add = (rule: string, message: string, severity: Severity = "error") => {
		findings.push({ rule, severity, message });
	};
	const invalid = (message: string) => add("invalid", message);

	let text: string;
	try {
		text = readFileSync(join(dir, "bundle.yaml"), "utf8");
	} catch {
		invalid("`bundle.yaml` is missing");
		return { dir, findings };
	}
	let doc: unknown;
	try {
		doc = Bun.YAML.parse(text);
	} catch (error) {
		invalid(
			`\`bundle.yaml\` is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
		return { dir, findings };
	}
	if (!isObj(doc)) {
		invalid("`bundle.yaml` must be a mapping");
		return { dir, findings };
	}
	for (const key of Object.keys(doc)) {
		if (!TOP_KEYS.includes(key)) invalid(`unknown key \`${key}\``);
	}
	for (const key of ["name", "description", "target"]) {
		if (typeof doc[key] !== "string" || doc[key].trim() === "") invalid(`\`${key}\` is missing`);
	}
	const target = typeof doc.target === "string" ? doc.target : "";
	if (target && !TARGETS.has(target))
		invalid(`\`target\`: \`${target}\` is not a target (${[...TARGETS.keys()].join(", ")})`);

	// Artifacts kept between runs.
	const crossRun = new Map<string, string>();
	for (const [artifact, value] of Object.entries(isObj(doc.artifacts) ? doc.artifacts : {})) {
		if (!isObj(value) || typeof value.kind !== "string" || value.scope !== "cross-run") {
			invalid(`artifacts.${artifact}: needs \`kind\` and \`scope: cross-run\``);
			continue;
		}
		if (!ARTIFACT_KINDS.includes(value.kind))
			add("unknown-term", `artifacts.${artifact}: \`${value.kind}\` is not an artifact kind`);
		crossRun.set(artifact, value.kind);
	}

	// Blocks.
	const blocks = new Map<string, BundleBlock>();
	if (!isObj(doc.blocks) || Object.keys(doc.blocks).length === 0)
		invalid("`blocks` is missing or empty");
	for (const name of repeated(text, "blocks"))
		add("duplicate-block", `\`blocks\` lists \`${name}\` twice; a bundle has one block per name`);
	for (const [name, entry] of Object.entries(isObj(doc.blocks) ? doc.blocks : {})) {
		const label = `block \`${name}\``;
		const report = (rule: string, message: string, severity: Severity = "error") => {
			add(rule, `${label}: ${message}`, severity);
		};
		if (!isObj(entry)) {
			report("invalid", "must be a mapping");
			continue;
		}
		for (const key of Object.keys(entry)) {
			if (!ENTRY_KEYS.includes(key) && !CREATED_KEYS.includes(key))
				report("invalid", `unknown key \`${key}\``);
		}
		const from = typeof entry.from === "string" ? entry.from : undefined;
		let origin: BundleBlock["origin"];
		if (from !== undefined) {
			if (entry.origin !== undefined)
				report(
					"invalid",
					"`from` and `origin` do not go together: `origin` is for a block with no `from`",
				);
			origin = "catalog";
		} else if (entry.origin === "imported" || entry.origin === "created") origin = entry.origin;
		else {
			report("invalid", "needs `from: <stack>/<block>`, or `origin: imported` or `created`");
			continue;
		}
		const block: BundleBlock = { name, origin, from, references: new Map() };
		if (entry.event !== undefined) {
			if (typeof entry.event === "string") block.event = entry.event;
			else report("invalid", "`event` must be the name of a hook event");
		}
		const folder = join(dir, "blocks", name);
		if (origin === "created") {
			if (isDir(folder))
				report(
					"created-folder",
					`\`blocks/${name}/\` exists; the assembler creates this block, so the bundle holds no file of it`,
				);
			if (entry.references !== undefined)
				report("invalid", "a created block has no text yet, so it declares no `references`");
			const raw = Object.fromEntries(
				CREATED_KEYS.filter((key) => key in entry).map((key) => [key, entry[key]]),
			);
			block.def = definition(raw, (rule, message, severity) => {
				report(rule === "bad-header" ? "invalid" : rule, message, severity);
			});
			terms(block.def, report);
		} else {
			for (const key of CREATED_KEYS) {
				if (key in entry)
					report(
						"invalid",
						`\`${key}\` is for a created block; this block's definition is the header of its main file`,
					);
			}
			const references = entry.references;
			if (references !== undefined && references !== null && !isObj(references))
				report("invalid", "`references` must be a mapping");
			for (const [id, bound] of Object.entries(isObj(references) ? references : {})) {
				if (bound === null || typeof bound === "string") block.references.set(id, bound);
				else report("invalid", `\`references.${id}\` must be a block of this bundle, or null`);
			}
			if (!isDir(folder)) report("no-folder", `\`blocks/${name}/\` is missing`);
			else {
				block.loaded = loadBlock(folder, label);
				findings.push(...block.loaded.findings);
				const head = block.loaded.header;
				block.def = head;
				if (head && origin === "catalog" && head.id !== from)
					report(
						"wrong-block",
						`\`blocks/${name}/\` holds ${head.id ? `\`${head.id}\`` : "a block with no `id`"}, and \`from\` says \`${from}\``,
					);
				if (head && origin === "imported" && (head.id !== undefined || head.source !== undefined))
					report("invalid", "an imported block has no `id` and no `source` in its header");
			}
		}
		blocks.set(name, block);
	}
	let folders: string[] = [];
	try {
		folders = readdirSync(join(dir, "blocks")).sort();
	} catch {
		// No `blocks/` at all: every block that needs a folder is reported above.
	}
	for (const folder of folders) {
		if (!blocks.has(folder))
			add("unlisted-folder", `\`blocks/${folder}\` belongs to no block of \`bundle.yaml\``);
	}

	// Concepts.
	const concepts = new Map<string, Choice>();
	for (const [concept, value] of Object.entries(isObj(doc.concepts) ? doc.concepts : {})) {
		if (concept === HARNESS) {
			invalid(`\`concepts.${HARNESS}\`: the target settles \`${HARNESS}\`; it has no entry`);
			continue;
		}
		if (!PROVIDED.has(concept)) {
			add("unknown-term", `\`concepts\`: \`${concept}\` is not a concept a block provides`);
			continue;
		}
		if (typeof value === "string") concepts.set(concept, { block: value });
		else if (
			isObj(value) &&
			typeof value["as-written"] === "string" &&
			Object.keys(value).length === 1
		)
			concepts.set(concept, { asWritten: value["as-written"] });
		else
			invalid(
				`\`concepts.${concept}\` must be a block of this bundle or \`{ as-written: <stack> }\``,
			);
	}
	const chosen = { target, concepts, blocks };
	for (const [concept, choice] of concepts) {
		if (!("block" in choice)) continue;
		const provider = blocks.get(choice.block);
		if (!provider)
			add(
				"unknown-block",
				`\`concepts.${concept}\`: \`${choice.block}\` is not listed under \`blocks\``,
			);
		else if (provider.def && !provider.def.provides.has(concept))
			add(
				"not-a-provider",
				`\`concepts.${concept}\`: block \`${choice.block}\` does not provide \`${concept}\``,
			);
	}

	// What each block needs from the others.
	const hooks = new Map<string, string[]>();
	for (const block of blocks.values()) {
		const def = block.def;
		if (!def) continue;
		const label = `block \`${block.name}\``;
		for (const [id, reference] of def.references) {
			if (!block.references.has(id)) {
				add(
					"unbound-reference",
					`${label}: its text names \`${id}\`, and \`references\` has no entry for it`,
				);
				continue;
			}
			const bound = block.references.get(id) ?? null;
			if (bound === null) {
				if (reference.required)
					add(
						"required-reference",
						`${label}: \`${id}\` is bound to null, and the block cannot do without it`,
					);
				continue;
			}
			const other = blocks.get(bound);
			if (!other)
				add(
					"unknown-block",
					`${label}: \`references.${id}\` is \`${bound}\`, which is not listed under \`blocks\``,
				);
			else if (other.def?.kind && other.def.kind !== reference.kind)
				add(
					"wrong-kind",
					`${label}: \`${id}\` is of kind \`${reference.kind}\`, and \`${bound}\` is of kind \`${other.def.kind}\``,
				);
		}
		for (const id of block.references.keys()) {
			if (!def.references.has(id))
				invalid(`${label}: \`references.${id}\` is not a reference the block declares`);
		}
		for (const [concept, use] of usesOf(block))
			findings.push(...checkUse(chosen, concept, use, label, block.origin === "created"));
		if (def.kind === "hook") {
			if (block.event === undefined) invalid(`${label}: a hook needs \`event\``);
			else hooks.set(block.event, [...(hooks.get(block.event) ?? []), block.name]);
		} else if (block.event !== undefined) invalid(`${label}: \`event\` is for a hook`);
	}
	for (const [event, members] of hooks) {
		if (members.length > 1)
			add("hook-clash", `${members.join(" and ")} both hook the event \`${event}\``);
	}

	// Flows.
	const need = (wanted: string, who: string): Finding[] => {
		const dot = wanted.indexOf(".");
		const concept = dot < 0 ? wanted : wanted.slice(0, dot);
		const term = dot < 0 ? "" : wanted.slice(dot + 1);
		const verbs = verbsOf(concept);
		const traits = traitsOf(concept);
		const unknown = (message: string): Finding[] => [
			{
				rule: "unknown-term",
				severity: "error",
				message: `${who} needs \`${wanted}\`: ${message}`,
			},
		];
		if (dot < 0) return unknown("a need is written `<Concept>.<verb or trait>`");
		if (!verbs || !traits) return unknown(`\`${concept}\` is not a concept of the language`);
		if (!verbs.includes(term) && !traits.includes(term))
			return unknown(`\`${concept}\` has no verb or trait \`${term}\``);
		const use: Use = {
			verbs: verbs.includes(term) ? [term] : [],
			needs: traits.includes(term) ? [term] : [],
			names: [],
		};
		return checkUse(chosen, concept, use, who, true);
	};
	const flows: Flat[] = [];
	const leads = new Map<string, string[]>();
	for (const name of repeated(text, "flows")) invalid(`\`flows\` lists \`${name}\` twice`);
	if (doc.flows !== undefined && doc.flows !== null && !isObj(doc.flows))
		invalid("`flows` must be a mapping");
	const rawFlows = Object.entries(isObj(doc.flows) ? doc.flows : {});
	for (const [name, raw] of rawFlows) {
		const { flat, findings: found } = loadFlow(name, raw, { blocks, crossRun });
		findings.push(...found);
		if (!flat) continue;
		flows.push(flat);
		leads.set(flat.lead, [...(leads.get(flat.lead) ?? []), name]);
		const written: [string, string][] = [
			["lead", flat.lead],
			...[...flat.inside].map(([level, id]): [string, string] => [`inside.${level}`, id]),
		];
		for (const [role, id] of written) {
			const block = blocks.get(id);
			if (block && block.origin !== "created")
				findings.push({
					rule: "not-created",
					severity: "error",
					flow: name,
					message: `\`${role}\` is \`${id}\`, which is not a created block; the assembler writes it from the flow`,
				});
		}
		findings.push(...analyze(flat, { blocks, need }));
	}
	for (const [lead, names] of leads) {
		if (names.length > 1)
			add(
				"two-flows",
				`block \`${lead}\` leads the flows ${names.join(" and ")}; a block leads one`,
			);
	}
	if (rawFlows.length > 0) {
		const routing = concepts.get("Routing");
		if (!routing || !("block" in routing))
			add(
				"no-routing",
				"the bundle has a flow, and no block provides `Routing`: `concepts.Routing` must name the block that says how an outcome is reported",
			);
		else {
			const provides = blocks.get(routing.block)?.def?.provides.get("Routing");
			if (provides && !provides.verbs.has("report"))
				add(
					"missing-verb",
					`\`${routing.block}\` provides \`Routing\` and has no sentence for \`report\``,
				);
		}
	}

	const name = typeof doc.name === "string" ? doc.name : "";
	return { dir, bundle: { name, target, concepts, crossRun, blocks, flows }, findings };
}
