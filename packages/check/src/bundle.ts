import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { cardRef } from "./load.ts";
import type { Annotation, CapabilityLevel, Card, Finding } from "./types.ts";

const LEVELS: CapabilityLevel[] = ["native", "emulated", "missing"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const strs = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

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

/** The YAML between the leading `---` lines, or undefined. */
export function frontmatter(text: string): Obj | undefined {
	const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
	if (!match) return undefined;
	try {
		const data = Bun.YAML.parse(match[1] ?? "");
		return isObj(data) ? data : undefined;
	} catch {
		return undefined;
	}
}

export type Bundle = {
	dir: string;
	annotations: Map<string, Annotation>;
	cards: Card[];
	findings: Finding[];
};

/** Top-level keys written twice in a frontmatter: YAML keeps one and says nothing. */
export function duplicateKeys(text: string): string[] {
	const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
	const seen = new Set<string>();
	const twice = new Set<string>();
	for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
		const key = /^([A-Za-z_][\w-]*):/.exec(line)?.[1];
		if (key === undefined) continue;
		if (seen.has(key)) twice.add(key);
		seen.add(key);
	}
	return [...twice];
}

/** Reads the block annotations and the component cards of a bundle folder. */
export async function loadBundle(dir: string): Promise<Bundle> {
	const findings: Finding[] = [];
	const annotations = new Map<string, Annotation>();
	const cards: Card[] = [];
	const read = async (path: string) => {
		const text = await Bun.file(join(dir, path)).text();
		const data = frontmatter(text);
		for (const key of duplicateKeys(text))
			findings.push({
				rule: "invalid",
				severity: "error",
				message: `${path}: the key \`${key}\` is written twice`,
			});
		if (!data)
			findings.push({
				rule: "invalid",
				severity: "error",
				message: `${path}: no readable frontmatter`,
			});
		return data;
	};
	for (const path of walk(dir, "annotations").filter((p) => p.endsWith(".md"))) {
		const data = await read(path);
		if (!data) continue;
		const block =
			typeof data.block === "string" ? data.block : path.slice("annotations/".length, -3);
		const parts = new Map<string, { lines: string; outcomes: string[] }>();
		for (const [name, value] of Object.entries(isObj(data.parts) ? data.parts : {})) {
			if (isObj(value))
				parts.set(name, { lines: String(value.lines ?? ""), outcomes: strs(value.outcomes) });
		}
		const files = strs(data.files);
		const touches = (Array.isArray(data.touches) ? data.touches : [])
			.filter(isObj)
			.map((touch) => ({
				component: String(touch.component ?? ""),
				file: typeof touch.file === "string" ? touch.file : undefined,
				lines: String(touch.lines ?? ""),
			}));
		const mentions = [data.refers, data.other]
			.flatMap((list) => (Array.isArray(list) ? list : []))
			.filter(isObj)
			.filter((entry) => entry.lines !== undefined)
			.map((entry) => ({
				file: typeof entry.file === "string" ? entry.file : undefined,
				lines: String(entry.lines),
			}));
		for (const touch of [...touches, ...mentions]) {
			if (!/^\d+(-\d+)?(,\s*\d+(-\d+)?)*$/.test(touch.lines)) {
				findings.push({
					rule: "invalid",
					severity: "error",
					message: `${path}: lines \`${touch.lines}\` are not \`n\`, \`n-m\` or a comma list of those`,
				});
			}
		}
		for (const card of new Set(touches.map((touch) => touch.component))) {
			if (cardRef(card) && !(await Bun.file(join(dir, card)).exists())) {
				findings.push({
					rule: "invalid",
					severity: "error",
					message: `${path}: card \`${card}\` is not in the bundle`,
				});
			}
		}
		for (const file of files) {
			if (!(await Bun.file(join(dir, file)).exists())) {
				findings.push({
					rule: "invalid",
					severity: "error",
					message: `${path}: file \`${file}\` is not in the bundle`,
				});
			}
		}
		annotations.set(block, {
			block,
			files,
			outcomes: strs(data.outcomes),
			parts,
			touches,
			mentions,
			needs: strs(data.needs),
			rewrite: typeof data.rewrite === "string" ? data.rewrite : undefined,
		});
	}
	for (const path of walk(dir, "components").filter((p) => p.endsWith(".md"))) {
		const data = await read(path);
		if (!data) continue;
		const ref = cardRef(path);
		if (!ref) {
			findings.push({
				rule: "invalid",
				severity: "error",
				message: `${path}: a card lives at \`components/<Type>/<name>.md\``,
			});
			continue;
		}
		const capabilities = new Map<string, CapabilityLevel>();
		for (const [cap, level] of Object.entries(isObj(data.capabilities) ? data.capabilities : {})) {
			if (LEVELS.includes(level as CapabilityLevel))
				capabilities.set(cap, level as CapabilityLevel);
			else
				findings.push({
					rule: "invalid",
					severity: "error",
					message: `${path}: capability \`${cap}\` must be native, emulated or missing`,
				});
		}
		cards.push({ path, ...ref, capabilities, fingerprints: strs(data.fingerprints) });
	}
	return { dir, annotations, cards, findings };
}

/** What each card of a bundle declares, in the shape `loadStack` takes. */
export const capabilitiesOf = (bundle: Bundle): Map<string, Map<string, CapabilityLevel>> =>
	new Map(bundle.cards.map((card) => [card.path, card.capabilities]));
