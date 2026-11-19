import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Annotation, Card, Finding } from "./types.ts";

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

/** Reads the block annotations and the implementation cards of a bundle folder. */
export async function loadBundle(dir: string): Promise<Bundle> {
	const findings: Finding[] = [];
	const annotations = new Map<string, Annotation>();
	const cards: Card[] = [];
	const read = async (path: string) => {
		const data = frontmatter(await Bun.file(join(dir, path)).text());
		if (!data)
			findings.push({
				rule: "invalid",
				severity: "error",
				message: `${path}: no readable frontmatter`,
			});
		return data;
	};
	for (const path of walk(dir, "blocks").filter((p) => p.endsWith(".md"))) {
		const data = await read(path);
		if (!data) continue;
		const block = typeof data.block === "string" ? data.block : path.slice("blocks/".length, -3);
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
				impl: String(touch.impl ?? ""),
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
		cards.push({
			component: String(data.component ?? ""),
			impl: String(data.impl ?? ""),
			status: String(data.status ?? ""),
			fingerprints: strs(data.fingerprints),
		});
	}
	return { dir, annotations, cards, findings };
}
