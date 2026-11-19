import { join } from "node:path";
import { type Bundle, frontmatter, walk } from "./bundle.ts";
import type { Finding, Flat } from "./types.ts";

const TEXT = /\.(md|ya?ml|json|sh|txt)$|^[^.]*$/;
const OWN = new Set(["assembly.json", "ASSEMBLY-REPORT.md"]);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Hunk = { from: number; removed: number; to: number; added: number };

/** The hunks of `diff -U0 source output`. */
function hunks(source: string, output: string): Hunk[] {
	const run = Bun.spawnSync(["diff", "-U0", source, output]);
	const count = (text: string | undefined) => (text === undefined ? 1 : Number(text));
	return [...run.stdout.toString().matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)].map(
		(match) => ({
			from: Number(match[1]),
			removed: count(match[2]),
			to: Number(match[3]),
			added: count(match[4]),
		}),
	);
}

/** The source line an output line is an unchanged copy of; undefined when it was added or changed. */
function origin(diff: Hunk[], line: number): number | undefined {
	let shift = 0;
	for (const hunk of diff) {
		if (hunk.added > 0 && line >= hunk.to && line < hunk.to + hunk.added) return undefined;
		// With nothing added, `to` is the output line the removed text followed.
		const before = hunk.added > 0 ? hunk.to + hunk.added - 1 < line : hunk.to < line;
		if (before) shift += hunk.added - hunk.removed;
	}
	return line - shift;
}

/** `"3, 7-9"` as inclusive ranges. */
const ranges = (lines: string): [number, number][] =>
	lines
		.split(",")
		.map((range) => range.trim().split("-").map(Number))
		.map(([first = 0, last = first]) => [first, last]);

/** Checks a plugin folder an assembler wrote from `bundle` for the stack `flat`. */
export async function checkAssembled(dir: string, flat: Flat, bundle: Bundle): Promise<Finding[]> {
	const findings: Finding[] = [];
	const add = (rule: string, message: string, severity: "error" | "warning" = "error") => {
		findings.push({ rule, severity, message });
	};
	const files = walk(dir);
	const text = new Map<string, string>();
	for (const path of files) {
		if (TEXT.test(path.split("/").pop() ?? ""))
			text.set(path, await Bun.file(join(dir, path)).text());
	}

	// The plugin and the installed blocks.
	let plugin = "";
	try {
		plugin = String(JSON.parse(text.get(".claude-plugin/plugin.json") ?? "").name ?? "");
	} catch {}
	if (!plugin) add("missing-file", "`.claude-plugin/plugin.json` is missing or has no `name`");
	const router = [...flat.blocks.values()].find((block) => block.role === "router");
	const installed = new Map<string, string>();
	for (const [id, block] of flat.blocks) {
		const path =
			block.kind === "agent"
				? `agents/${block.as}.md`
				: block.kind === "prompt"
					? `skills/${router?.as}/prompts/${block.as}.md`
					: `skills/${block.as}/SKILL.md`;
		installed.set(id, path);
		if (!text.has(path)) add("missing-block", `block \`${id}\` should be installed at \`${path}\``);
	}

	// Frontmatter of skills and agents.
	const names = new Map<string, string>();
	for (const [path, body] of text) {
		const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(path)?.[1];
		const agent = /^agents\/([^/]+)\.md$/.exec(path)?.[1];
		if (!skill && !agent) continue;
		const data = frontmatter(body);
		if (!data || typeof data.name !== "string" || typeof data.description !== "string") {
			add("bad-frontmatter", `\`${path}\` needs frontmatter with \`name\` and \`description\``);
			continue;
		}
		if (data.name !== (skill ?? agent))
			add("bad-frontmatter", `\`${path}\` is named \`${data.name}\` in its frontmatter`);
		const other = names.get(data.name);
		if (other) add("name-clash", `\`${path}\` and \`${other}\` are both named \`${data.name}\``);
		names.set(data.name, path);
	}

	// Which output came from which source.
	let assembly: Record<string, unknown> = {};
	try {
		assembly = JSON.parse(text.get("assembly.json") ?? "");
	} catch {
		add("missing-file", "`assembly.json` is missing or not valid JSON");
	}
	const sourceOf = new Map<string, { block: string; source: string }>();
	for (const path of files) {
		if (OWN.has(path)) continue;
		const entry = assembly[path];
		if (entry === undefined)
			add("unlisted-file", `\`${path}\` is not listed in \`assembly.json\``, "warning");
		else if (typeof entry === "object" && entry !== null) {
			const { block, source } = entry as { block?: unknown; source?: unknown };
			if (typeof block === "string" && typeof source === "string")
				sourceOf.set(path, { block, source });
		}
	}

	// Leftovers of replaced implementations, and references that lead nowhere.
	const replaced = bundle.cards.filter(
		(card) =>
			card.status === "replaced" &&
			flat.components.get(card.component)?.replaces.includes(card.impl),
	);
	const homes = new Set([...flat.blocks.keys()].map((id) => id.split("/")[0] ?? ""));
	homes.delete(plugin);
	for (const [path, body] of text) {
		if (OWN.has(path)) continue;
		const from = sourceOf.get(path);
		const annotation = from ? bundle.annotations.get(from.block) : undefined;
		const source = from ? join(bundle.dir, from.source) : undefined;
		const diff =
			source !== undefined && (await Bun.file(source).exists())
				? hunks(source, join(dir, path))
				: undefined;
		// Source lines the annotation says were written for an implementation the stack replaced.
		const meant = (annotation?.touches ?? [])
			.filter(
				(touch) =>
					(touch.file ?? annotation?.files[0]) === from?.source &&
					flat.components.get(touch.component)?.replaces.includes(touch.impl),
			)
			.flatMap((touch) => ranges(touch.lines));
		/**
		 * A hit on a line the assembler wrote, or left alone inside such a touch, is the assembler's
		 * miss. On a line that is the source's own and that no touch covers, the annotation missed it.
		 */
		const kept = (line: number): boolean => {
			const copied = diff ? origin(diff, line) : undefined;
			return copied !== undefined && !meant.some(([lo, hi]) => copied >= lo && copied <= hi);
		};
		const lines = body.split("\n");
		for (const card of replaced) {
			for (const fingerprint of card.fingerprints) {
				const pattern = new RegExp(`(?<![\\w-])${escapeRegExp(fingerprint)}(?![\\w-])`);
				const hits = lines.flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
				const what = `\`${fingerprint}\` belongs to ${card.component} \`${card.impl}\`, which the stack replaced`;
				const missed = hits.filter((line) => !kept(line));
				const uncovered = hits.filter(kept);
				if (missed.length > 0) add("leftover", `\`${path}\` line ${missed.join(", ")}: ${what}`);
				if (uncovered.length > 0) {
					add(
						"leftover",
						`\`${path}\` line ${uncovered.join(", ")}: ${what} (the source's own line, covered by no touch)`,
						"warning",
					);
				}
			}
		}
		lines.forEach((line, index) => {
			const at = `\`${path}\` line ${index + 1}`;
			for (const match of line.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) {
				const target = (match[1] ?? "").replace(/[.,;:]+$/, "");
				if (
					!files.includes(target) &&
					!files.some((file) => file.startsWith(`${target.replace(/\/$/, "")}/`))
				) {
					add("unresolved-path", `${at}: \`${match[0]}\` is not in the plugin`);
				}
			}
			if (/(\/Users\/|\/home\/)[\w.-]+\/|plugins\/cache\//.test(line))
				add("absolute-path", `${at}: a path outside the plugin`);
			for (const match of line.matchAll(/(?<![\w/.-])([a-z][\w-]*):([a-z][\w-]*)(?![\w-]*\/)/g)) {
				const [whole, owner = "", name = ""] = match;
				if (homes.has(owner)) {
					const own = kept(index + 1);
					add(
						"home-reference",
						`${at}: \`${whole}\` refers to the stack the block came from${own ? " (the source's own line, covered by no touch)" : ""}`,
						own ? "warning" : "error",
					);
				} else if (owner === plugin && !text.has(`skills/${name}/SKILL.md`))
					add("unresolved-handoff", `${at}: \`${whole}\` is not a skill of this plugin`);
			}
		});
	}

	// The lead must know every block, and every cell block must report an outcome.
	const lead = router ? text.get(`skills/${router.as}/SKILL.md`) : undefined;
	if (!router) add("missing-block", "the stack names no router block");
	const cells = new Set(
		[...flat.nodes.values()].flatMap((node) => (node.block ? [node.block] : [])),
	);
	for (const [id, block] of flat.blocks) {
		if (block === router) continue;
		if (
			lead !== undefined &&
			!new RegExp(`(?<![\\w-])${escapeRegExp(block.as)}(?![\\w-])`).test(lead)
		) {
			add("unresolved-handoff", `the lead skill never mentions \`${block.as}\` (block \`${id}\`)`);
		}
		const body = text.get(installed.get(id) ?? "");
		if (cells.has(id) && body !== undefined && !body.includes("OUTCOME:")) {
			add(
				"missing-outcome",
				`\`${installed.get(id)}\` never says how to report its outcome (\`OUTCOME: <outcome>\`)`,
			);
		}
	}
	if (lead !== undefined) {
		for (const level of flat.levels) {
			if (level && !lead.includes(level))
				add("unresolved-handoff", `the lead skill never mentions the level \`${level}\``);
		}
	}

	// Changes outside the lines the annotations cover: for a person to look at.
	for (const [path, from] of sourceOf) {
		// The router is written for this stack; its source is a starting point, not a text to keep.
		if (flat.blocks.get(from.block)?.role === "router") continue;
		const annotation = bundle.annotations.get(from.block);
		const source = join(bundle.dir, from.source);
		if (!annotation || !(await Bun.file(source).exists())) {
			add(
				"unresolved-path",
				`\`assembly.json\`: \`${path}\` names block \`${from.block}\` and source \`${from.source}\`; one of them is not in the bundle`,
			);
			continue;
		}
		const main = annotation.files[0];
		const covered = [...annotation.touches, ...annotation.mentions]
			.filter((entry) => (entry.file ?? main) === from.source)
			.flatMap((entry) => ranges(entry.lines))
			.map(([first, last]) => [first - 1, last + 1] as const);
		// The installed name is the stack's choice, so a new `name` in the frontmatter is expected.
		const sourceLines = (await Bun.file(source).text()).split("\n");
		const head = sourceLines[0] === "---" ? sourceLines.indexOf("---", 1) : 0;
		const naming = (line: number) => line <= head && /^name:/.test(sourceLines[line - 1] ?? "");
		const outside = hunks(source, join(dir, path))
			// Added lines replace nothing of the source, so they are not a change to it.
			.filter((hunk) => hunk.removed > 0)
			.map((hunk) => [hunk.from, hunk.from + hunk.removed - 1] as const)
			.filter(([first, last]) => !(first === last && naming(first)))
			.filter(([first, last]) => !covered.some(([lo, hi]) => first >= lo && last <= hi))
			.map(([first, last]) => (first === last ? `${first}` : `${first}-${last}`));
		if (outside.length > 0) {
			add(
				"uncovered-change",
				`\`${path}\` changes lines of \`${from.source}\` that no touch covers: ${outside.join(", ")}`,
				"warning",
			);
		}
	}
	return findings;
}
