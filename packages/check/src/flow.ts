import { isObj, type Obj, strs } from "./block.ts";
import { ARTIFACT_KINDS } from "./language.ts";
import type { BundleBlock, Edge, Finding, Flat, Node, Read } from "./types.ts";

type RawRoute = {
	to: string;
	max?: number;
	whenUsedUp?: string;
	releases: string[];
	resets: string[];
};

const FLOW_KEYS = [
	"description",
	"lead",
	"levels",
	"inside",
	"start",
	"ends",
	"inputs",
	"artifacts",
	"files",
	"around",
	"steps",
];
const STEP_KEYS = [
	"does",
	"block",
	"only",
	"inputs",
	"outputs",
	"reads",
	"writes",
	"claims",
	"releases",
	"needs",
	"outcomes",
	"children",
	"at",
];
const ROUTE_KEYS = ["to", "max", "then", "releases", "resets"];

export const NEXT_CHILD = "next-child";
export const ALL_DONE = "all-done";
/** The key of `files` that says where the lead keeps the count of every bounded route. */
export const COUNTERS = "counters";

/** An artifact's name without its level. */
export const base = (artifact: string) => artifact.split("@")[0] ?? artifact;

export type FlowContext = {
	blocks: Map<string, BundleBlock>;
	/** Artifacts kept between runs, with their kind. */
	crossRun: Map<string, string>;
};

/** Reads one flow of a bundle and writes its levels out into one flat graph. */
export function loadFlow(
	name: string,
	doc: unknown,
	context: FlowContext,
): { flat?: Flat; findings: Finding[] } {
	const findings: Finding[] = [];
	const add = (rule: string, message: string) => {
		findings.push({ rule, severity: "error", flow: name, message });
	};
	const invalid = (message: string) => add("invalid", message);

	if (!isObj(doc)) {
		invalid("a flow must be a mapping");
		return { findings };
	}
	for (const key of Object.keys(doc)) {
		if (!FLOW_KEYS.includes(key)) invalid(`unknown key \`${key}\``);
	}
	const knownBlock = (ref: string, where: string) => {
		const id = ref.split("#")[0] ?? ref;
		if (!context.blocks.has(id))
			add("unknown-block", `${where}: \`${id}\` is not listed under \`blocks\``);
	};
	const lead = typeof doc.lead === "string" ? doc.lead : "";
	if (!lead) invalid("`lead` is missing");
	else knownBlock(lead, "lead");
	const ends = strs(doc.ends);
	if (ends.length === 0) invalid("`ends` must list at least one end");
	const start = typeof doc.start === "string" ? doc.start : "";
	if (!start) invalid("`start` is missing");
	if (!isObj(doc.steps) || Object.keys(doc.steps).length === 0) {
		invalid("`steps` is missing or empty");
		return { findings };
	}
	if (findings.some((finding) => finding.rule === "invalid")) return { findings };

	const leveled = Array.isArray(doc.levels);
	const levels = leveled ? strs(doc.levels) : [""];
	if (leveled && levels.length === 0) invalid("`levels` must list at least one level");
	const inputs = new Set(strs(doc.inputs));
	const kinds = new Map(context.crossRun);
	for (const [artifact, kind] of Object.entries(isObj(doc.artifacts) ? doc.artifacts : {})) {
		if (typeof kind !== "string") {
			invalid(`artifacts.${artifact}: must be an artifact kind`);
			continue;
		}
		if (!ARTIFACT_KINDS.includes(kind))
			add("unknown-term", `artifacts.${artifact}: \`${kind}\` is not an artifact kind`);
		const kept = context.crossRun.get(artifact);
		if (kept !== undefined && kept !== kind)
			invalid(
				`artifacts.${artifact}: the bundle keeps \`${artifact}\` between runs as a ${kept}, the flow says ${kind}`,
			);
		kinds.set(artifact, kind);
	}
	/** Names that belong to the whole flow or the whole bundle, not to one level. */
	const globals = new Set([...inputs, ...context.crossRun.keys()]);

	const paths = new Map<string, string>();
	for (const [artifact, value] of Object.entries(isObj(doc.files) ? doc.files : {})) {
		if (typeof value === "string") {
			paths.set(artifact, value);
			continue;
		}
		if (!isObj(value) || artifact === COUNTERS) {
			invalid(
				artifact === COUNTERS
					? `files.${COUNTERS}: must be a path`
					: `files.${artifact}: a path, or a mapping of level to path`,
			);
			continue;
		}
		for (const [level, path] of Object.entries(value)) {
			if (!levels.includes(level)) invalid(`files.${artifact}: unknown level \`${level}\``);
			else if (typeof path !== "string") invalid(`files.${artifact}.${level}: must be a path`);
			else paths.set(`${artifact}@${level}`, path);
		}
	}
	const inside = new Map<string, string>();
	for (const [level, block] of Object.entries(isObj(doc.inside) ? doc.inside : {})) {
		if (levels.indexOf(level) < 1)
			invalid(`inside: \`${level}\` is not a level below the outermost`);
		else if (typeof block !== "string") invalid(`inside.${level}: must name a block`);
		else {
			knownBlock(block, `inside.${level}`);
			inside.set(level, block);
		}
	}
	for (const entry of Array.isArray(doc.around) ? doc.around : []) {
		if (isObj(entry) && typeof entry.block === "string") knownBlock(entry.block, "around");
		else invalid("each entry of `around` needs `block`");
	}

	// Steps as written.
	const steps = new Map<string, Obj>();
	for (const [step, value] of Object.entries(doc.steps)) {
		if (!isObj(value)) {
			invalid(`step \`${step}\` must be a mapping`);
			continue;
		}
		if (ends.includes(step)) invalid(`step \`${step}\` has the name of an end`);
		for (const key of Object.keys(value)) {
			if (!STEP_KEYS.includes(key)) invalid(`step \`${step}\`: unknown key \`${key}\``);
		}
		for (const level of strs(value.only)) {
			if (!levels.includes(level))
				invalid(`step \`${step}\`: \`only\` names unknown level \`${level}\``);
		}
		for (const [level, override] of Object.entries(isObj(value.at) ? value.at : {})) {
			if (!levels.includes(level))
				invalid(`step \`${step}\`: \`at\` names unknown level \`${level}\``);
			if (override !== false && !isObj(override))
				invalid(`step \`${step}\`: \`at.${level}\` must be a mapping or false`);
			for (const key of Object.keys(isObj(override) ? override : {})) {
				if (key === "at" || key === "only" || !STEP_KEYS.includes(key)) {
					invalid(`step \`${step}\`: \`at.${level}\` cannot set \`${key}\``);
				}
			}
		}
		steps.set(step, value);
	}
	const descending = [...steps].filter(
		([, value]) =>
			isObj(value.children) ||
			Object.values(isObj(value.at) ? value.at : {}).some((o) => isObj(o) && isObj(o.children)),
	);
	const desc = descending[0]?.[0];
	if (descending.length > 1)
		invalid("more than one step has `children`; one step runs the flow one level down");
	if (levels.length > 1 && !desc) invalid("the flow has levels but no step has `children`");
	if (findings.some((finding) => finding.rule === "invalid")) return { findings };

	const id = (li: number, step: string) => (leveled ? `${levels[li]}/${step}` : step);
	const exists = (step: string, li: number) => {
		const raw = steps.get(step);
		if (!raw) return false;
		const only = strs(raw.only);
		if (only.length > 0 && !only.includes(levels[li] ?? "")) return false;
		return !(isObj(raw.at) && raw.at[levels[li] ?? ""] === false);
	};
	/** The step as it is at one level: each key of `at.<level>` replaces the step's own. */
	const at = (step: string, li: number): Obj => {
		const raw = steps.get(step) ?? {};
		const override = isObj(raw.at) ? raw.at[levels[li] ?? ""] : undefined;
		return isObj(override) ? { ...raw, ...override } : raw;
	};

	const artifactLevel = new Map<string, number>();
	const scoped = (ref: string, li: number, where: string, registry?: Map<string, number>) => {
		let name = ref;
		let index = li;
		if (ref.startsWith("child:")) {
			name = ref.slice(6);
			index = li + 1;
		} else if (ref.startsWith("parent:")) {
			name = ref.slice(7);
			index = li - 1;
		}
		if (globals.has(name) || !leveled) return name;
		if (index < 0 || index >= levels.length) {
			invalid(`${where}: \`${ref}\` points outside the levels`);
			return undefined;
		}
		const full = `${name}@${levels[index]}`;
		registry?.set(full, index);
		return full;
	};
	const scopedAll = (refs: string[], li: number, where: string, registry?: Map<string, number>) =>
		refs.map((ref) => scoped(ref, li, where, registry)).filter((x): x is string => x !== undefined);

	const route = (value: unknown, where: string): RawRoute | undefined => {
		if (typeof value === "string") return { to: value, releases: [], resets: [] };
		if (!isObj(value) || typeof value.to !== "string") {
			invalid(`${where}: a route is a step name or a mapping with \`to\``);
			return undefined;
		}
		for (const key of Object.keys(value)) {
			if (!ROUTE_KEYS.includes(key)) invalid(`${where}: unknown route key \`${key}\``);
		}
		const max = value.max;
		if (max !== undefined && (typeof max !== "number" || !Number.isInteger(max) || max < 1)) {
			invalid(`${where}: \`max\` must be a whole number above zero`);
			return undefined;
		}
		if (value.then !== undefined && max === undefined) invalid(`${where}: \`then\` needs \`max\``);
		return {
			to: value.to,
			max: typeof max === "number" ? max : undefined,
			whenUsedUp: typeof value.then === "string" ? value.then : undefined,
			releases: strs(value.releases),
			resets: strs(value.resets),
		};
	};

	const nodes = new Map<string, Node>();
	const edges: Edge[] = [];
	/** `<parent level index> <end>` pairs some child can reach. */
	const childEnds = new Set<string>();

	const target = (
		to: string,
		li: number,
		where: string,
		seen = new Set<string>(),
	): string | undefined => {
		if (ends.includes(to)) {
			if (li === 0) return to;
			const parent = id(li - 1, desc ?? "");
			if (to === ends[0]) return parent;
			childEnds.add(`${li - 1} ${to}`);
			return `${parent}.child-${to}`;
		}
		const raw = steps.get(to);
		if (!raw) {
			invalid(`${where}: \`${to}\` is neither a step nor an end of this flow`);
			return undefined;
		}
		if (exists(to, li)) return id(li, to);
		// The step does not exist at this level: pass through its first outcome.
		if (seen.has(to)) {
			invalid(`${where}: the steps skipped at level \`${levels[li]}\` lead back to \`${to}\``);
			return undefined;
		}
		seen.add(to);
		const first = Object.values(isObj(raw.outcomes) ? raw.outcomes : {})[0];
		const through = typeof first === "string" ? first : isObj(first) ? first.to : undefined;
		if (typeof through !== "string") {
			invalid(
				`${where}: step \`${to}\` is skipped at level \`${levels[li]}\` and has no outcome to pass through`,
			);
			return undefined;
		}
		return target(through, li, where, seen);
	};

	const addRoute = (from: string, outcome: string, raw: RawRoute, li: number) => {
		const where = `${from}.${outcome}`;
		const to = target(raw.to, li, where);
		if (to === undefined) return;
		const releases = scopedAll(raw.releases, li, where);
		const resets = raw.resets.map((ref) => {
			const dot = ref.lastIndexOf(".");
			return `${id(li, ref.slice(0, dot))}.${ref.slice(dot + 1)}`;
		});
		if (raw.max === undefined) {
			edges.push({ from, outcome, to, exhausted: false, releases, clears: [], resets });
			return;
		}
		edges.push({
			from,
			outcome,
			to,
			bound: { counter: where, kind: "max", max: raw.max },
			exhausted: false,
			releases,
			clears: [],
			resets,
		});
		if (raw.whenUsedUp === undefined) {
			add(
				"bound-without-route",
				`${where} may be taken ${raw.max} times, but nothing says where it leads after that (add \`then\`)`,
			);
			return;
		}
		const then = target(raw.whenUsedUp, li, where);
		if (then !== undefined) {
			edges.push({ from, outcome, to: then, exhausted: true, releases, clears: [], resets: [] });
		}
	};

	for (let li = 0; li < levels.length; li++) {
		for (const step of steps.keys()) {
			if (!exists(step, li)) continue;
			const def = at(step, li);
			const nid = id(li, step);
			const descends = step === desc && li < levels.length - 1;
			const ref = typeof def.block === "string" ? def.block : undefined;
			if (ref) knownBlock(ref, nid);
			const block = ref?.split("#")[0];
			const declared = block ? context.blocks.get(block)?.def : undefined;

			const reads: Read[] = [];
			for (const entry of Array.isArray(def.reads) ? def.reads : []) {
				const name = typeof entry === "string" ? entry : isObj(entry) ? entry.artifact : undefined;
				if (typeof name !== "string") {
					invalid(`${nid}: a read is an artifact name or \`{ artifact, optional }\``);
					continue;
				}
				const artifact = scoped(name, li, nid, artifactLevel);
				if (artifact) reads.push({ artifact, optional: isObj(entry) && entry.optional === true });
			}
			const given = (key: "inputs" | "outputs") => {
				const result = new Map<string, string>();
				const value = def[key];
				if (value === undefined || value === null) return result;
				if (!isObj(value) || !ref) {
					invalid(
						ref
							? `${nid}: \`${key}\` maps each ${key.slice(0, -1)} of the block to an artifact`
							: `${nid}: \`${key}\` needs a block; what the lead itself handles goes under \`reads\` and \`writes\``,
					);
					return result;
				}
				for (const [slot, name] of Object.entries(value)) {
					if (typeof name !== "string") {
						invalid(`${nid}: \`${key}.${slot}\` must name an artifact`);
						continue;
					}
					const artifact = scoped(name, li, nid, artifactLevel);
					if (artifact) result.set(slot, artifact);
				}
				return result;
			};
			const blockInputs = given("inputs");
			const blockOutputs = given("outputs");
			for (const [slot, artifact] of blockInputs) {
				// An artifact given for an input the block can do without may not exist yet.
				reads.push({ artifact, optional: declared?.inputs.get(slot)?.required === false });
			}
			const children = isObj(def.children) ? def.children : {};
			nodes.set(nid, {
				id: nid,
				level: li,
				step,
				block,
				part: ref?.split("#")[1],
				synthetic: false,
				descends,
				childRoutes: descends ? Object.keys(children) : [],
				inputs: blockInputs,
				outputs: blockOutputs,
				reads,
				writes: [...scopedAll(strs(def.writes), li, nid, artifactLevel), ...blockOutputs.values()],
				claims: scopedAll(strs(def.claims), li, nid),
				releases: scopedAll(strs(def.releases), li, nid),
				needs: strs(def.needs),
			});
			for (const [outcome, value] of Object.entries(isObj(def.outcomes) ? def.outcomes : {})) {
				const raw = route(value, `${nid}.${outcome}`);
				if (raw) addRoute(nid, outcome, raw, li);
			}
			if (!descends) continue;
			const first = target(start, li + 1, `${nid}.${NEXT_CHILD}`);
			if (first !== undefined) {
				edges.push({
					from: nid,
					outcome: NEXT_CHILD,
					to: first,
					bound: { counter: `${nid}.${NEXT_CHILD}`, kind: "each" },
					exhausted: false,
					releases: [],
					clears: [],
					resets: [],
				});
			}
			const done = children[ends[0] ?? ""];
			if (done === undefined) invalid(`${nid}: \`children.${ends[0]}\` is missing`);
			else {
				const raw = route(done, `${nid}.${ALL_DONE}`);
				if (raw) addRoute(nid, ALL_DONE, raw, li);
			}
		}
	}

	// A child that ended another way than the first end: one node per (level, end), routed by `children.<end>`.
	const made = new Set<string>();
	for (let grew = true; grew; ) {
		grew = false;
		for (const key of [...childEnds]) {
			if (made.has(key)) continue;
			made.add(key);
			grew = true;
			const [index, end] = key.split(" ") as [string, string];
			const li = Number(index);
			const parent = id(li, desc ?? "");
			const nid = `${parent}.child-${end}`;
			nodes.set(nid, {
				id: nid,
				level: li,
				step: desc ?? "",
				synthetic: true,
				descends: false,
				childRoutes: [],
				inputs: new Map(),
				outputs: new Map(),
				reads: [],
				writes: [],
				claims: [],
				releases: [],
				needs: [],
			});
			const children = at(desc ?? "", li).children;
			const value = isObj(children) ? children[end] : undefined;
			if (value === undefined) {
				add(
					"unrouted-outcome",
					`a child of ${parent} can end \`${end}\`, and \`children.${end}\` does not say where that leads`,
				);
				continue;
			}
			const raw = route(value, `${nid}.${end}`);
			if (raw) addRoute(nid, end, raw, li);
		}
	}

	// What starting a child, or entering the descending step again, sets back.
	const counters = new Map<string, number>();
	for (const edge of edges) {
		if (edge.bound) counters.set(edge.bound.counter, nodes.get(edge.from)?.level ?? 0);
	}
	const writtenBy = new Map<string, Set<number>>();
	for (const node of nodes.values()) {
		for (const artifact of node.writes) {
			if (!writtenBy.has(artifact)) writtenBy.set(artifact, new Set());
			writtenBy.get(artifact)?.add(node.level);
		}
	}
	for (const edge of edges) {
		const from = nodes.get(edge.from);
		if (!from) continue;
		if (edge.outcome === NEXT_CHILD && from.descends) {
			for (const [artifact, level] of artifactLevel) {
				const fromParent = level === from.level + 1 && writtenBy.get(artifact)?.has(from.level);
				if (level > from.level && !fromParent) edge.clears.push(artifact);
			}
			for (const [counter, level] of counters) {
				if (level > from.level) edge.resets.push(counter);
			}
		} else if (nodes.get(edge.to)?.descends && from.level === nodes.get(edge.to)?.level) {
			edge.resets.push(`${edge.to}.${NEXT_CHILD}`);
		}
		for (const counter of edge.resets) {
			if (!counters.has(counter))
				invalid(
					`${edge.from}.${edge.outcome}: \`resets\` names \`${counter}\`, which has no \`max\``,
				);
		}
	}

	// The kind of every artifact of the flow.
	const unkinded = new Map<string, string>();
	for (const node of nodes.values()) {
		for (const artifact of [...node.reads.map((read) => read.artifact), ...node.writes]) {
			if (!kinds.has(base(artifact)) && !unkinded.has(base(artifact)))
				unkinded.set(base(artifact), node.id);
		}
	}
	for (const artifact of inputs) if (!kinds.has(artifact)) unkinded.set(artifact, "inputs");
	for (const [artifact, where] of unkinded)
		add("no-kind", `\`${artifact}\` (${where}) has no kind under \`artifacts\``);

	const first = target(start, 0, "start");
	if (first === undefined || findings.some((f) => f.rule === "invalid")) return { findings };
	return {
		flat: {
			name,
			lead,
			levels,
			start: first,
			ends,
			inputs,
			crossRun: new Set(context.crossRun.keys()),
			kinds,
			paths,
			inside,
			nodes,
			edges,
		},
		findings,
	};
}
