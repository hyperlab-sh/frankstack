import { ALL_DONE, NEXT_CHILD } from "./load.ts";
import type { Annotation, Edge, Finding, Flat } from "./types.ts";

const norm = (outcome: string) => outcome.toLowerCase().replaceAll("_", "-");
const step = (edge: Edge) => `${edge.from} -(${edge.outcome})-> ${edge.to}`;

/** Shortest path from `start` over states (node, flag), or undefined. `flag` follows `next`. */
function witness(
	flat: Flat,
	out: Map<string, Edge[]>,
	initial: boolean,
	next: (flag: boolean, edge: Edge) => boolean,
	goal: (node: string, flag: boolean, via?: Edge) => boolean,
): string[] | undefined {
	const key = (node: string, flag: boolean) => `${node}\u0000${flag}`;
	const from = new Map<string, { prev?: string; edge?: Edge }>([[key(flat.start, initial), {}]]);
	const queue: [string, boolean][] = [[flat.start, initial]];
	const path = (last: string) => {
		const edges: Edge[] = [];
		for (let at = from.get(last); at?.edge; at = from.get(at.prev ?? "")) edges.unshift(at.edge);
		return edges.map(step);
	};
	if (goal(flat.start, initial)) return [];
	for (let head = 0; head < queue.length; head++) {
		const [node, flag] = queue[head] as [string, boolean];
		for (const edge of out.get(node) ?? []) {
			const flagAfter = next(flag, edge);
			const to = key(edge.to, flagAfter);
			if (from.has(to)) continue;
			from.set(to, { prev: key(node, flag), edge });
			if (goal(edge.to, flagAfter, edge)) return path(to);
			if (flat.nodes.has(edge.to)) queue.push([edge.to, flagAfter]);
		}
	}
	return undefined;
}

/** Strongly connected components (Tarjan), as lists of node ids. */
function components(nodes: string[], edges: Edge[]): string[][] {
	const out = new Map<string, string[]>();
	for (const edge of edges) out.set(edge.from, [...(out.get(edge.from) ?? []), edge.to]);
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const result: string[][] = [];
	let counter = 0;
	const visit = (node: string) => {
		index.set(node, counter);
		low.set(node, counter++);
		stack.push(node);
		onStack.add(node);
		for (const to of out.get(node) ?? []) {
			if (!index.has(to)) {
				visit(to);
				low.set(node, Math.min(low.get(node) ?? 0, low.get(to) ?? 0));
			} else if (onStack.has(to)) low.set(node, Math.min(low.get(node) ?? 0, index.get(to) ?? 0));
		}
		if (low.get(node) !== index.get(node)) return;
		const component: string[] = [];
		for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
			onStack.delete(top);
			component.push(top);
			if (top === node) break;
		}
		result.push(component);
	};
	for (const node of nodes) if (!index.has(node)) visit(node);
	return result;
}

/** A cycle inside `inside` using only `edges`, as a trace, or undefined. */
function cycle(inside: Set<string>, edges: Edge[]): string[] | undefined {
	const out = new Map<string, Edge[]>();
	for (const edge of edges) {
		if (inside.has(edge.from) && inside.has(edge.to))
			out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
	}
	const state = new Map<string, number>();
	const path: Edge[] = [];
	const visit = (node: string): string[] | undefined => {
		state.set(node, 1);
		for (const edge of out.get(node) ?? []) {
			path.push(edge);
			if (state.get(edge.to) === 1) {
				const first = path.findIndex((e) => e.from === edge.to);
				return path.slice(first).map(step);
			}
			if (!state.has(edge.to)) {
				const found = visit(edge.to);
				if (found) return found;
			}
			path.pop();
		}
		state.set(node, 2);
		return undefined;
	};
	for (const node of inside) {
		if (!state.has(node)) {
			const found = visit(node);
			if (found) return found;
		}
	}
	return undefined;
}

/** Checks one expanded stack. `annotations` adds the checks that need the blocks' own declarations. */
export function analyze(flat: Flat, annotations?: Map<string, Annotation>): Finding[] {
	const findings: Finding[] = [];
	const add = (
		rule: string,
		message: string,
		trace?: string[],
		severity: "error" | "warning" = "error",
	) => {
		findings.push({ rule, severity, message, trace });
	};
	const ends = new Set(flat.ends);
	const out = new Map<string, Edge[]>();
	const into = new Map<string, Edge[]>();
	for (const edge of flat.edges) {
		out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
		into.set(edge.to, [...(into.get(edge.to) ?? []), edge]);
	}

	// Reachability.
	const reach = (starts: string[], next: (node: string) => string[]) => {
		const seen = new Set(starts);
		const queue = [...starts];
		for (let head = 0; head < queue.length; head++) {
			for (const to of next(queue[head] as string)) {
				if (!seen.has(to)) {
					seen.add(to);
					queue.push(to);
				}
			}
		}
		return seen;
	};
	const reachable = reach([flat.start], (node) => (out.get(node) ?? []).map((e) => e.to));
	const finishes = reach([...ends], (node) => (into.get(node) ?? []).map((e) => e.from));
	for (const node of flat.nodes.values()) {
		if (!reachable.has(node.id)) {
			add("unreachable-step", `no path from the start reaches ${node.id}`);
			continue;
		}
		if ((out.get(node.id) ?? []).length === 0)
			add("dead-end", `${node.id} has no outcome, so the run stops there`);
		else if (!finishes.has(node.id))
			add("end-unreachable", `no path from ${node.id} reaches an end`);
	}
	const live = [...flat.nodes.values()].filter((node) => reachable.has(node.id));

	// What is written on every path (forward, intersection where paths meet).
	const everything = new Set<string>();
	const writers = new Map<string, string[]>();
	const readers = new Set<string>();
	for (const node of flat.nodes.values()) {
		for (const artifact of node.writes) {
			everything.add(artifact);
			writers.set(artifact, [...(writers.get(artifact) ?? []), node.id]);
		}
		for (const read of node.reads) {
			everything.add(read.artifact);
			readers.add(read.artifact);
		}
	}
	const initial = new Set([...flat.inputs].filter((artifact) => !flat.crossRun.has(artifact)));
	const written = new Map<string, Set<string>>();
	for (const node of live)
		written.set(node.id, new Set(node.id === flat.start ? initial : everything));
	for (let changed = true; changed; ) {
		changed = false;
		for (const node of live) {
			const before = written.get(node.id) as Set<string>;
			const after = new Set([...before, ...node.writes]);
			for (const edge of out.get(node.id) ?? []) {
				const target = written.get(edge.to);
				if (!target) continue;
				for (const artifact of [...target]) {
					if (!after.has(artifact) || edge.clears.includes(artifact)) {
						target.delete(artifact);
						changed = true;
					}
				}
			}
		}
	}
	for (const node of live) {
		for (const read of node.reads) {
			if (read.optional || written.get(node.id)?.has(read.artifact)) continue;
			const a = read.artifact;
			if (!writers.has(a) && !flat.inputs.has(a)) {
				add(
					"no-writer",
					`${node.id} reads \`${a}\`, which no step writes and the user does not provide`,
				);
				continue;
			}
			const trace = witness(
				flat,
				out,
				initial.has(a),
				(has, edge) =>
					(has || (flat.nodes.get(edge.from)?.writes.includes(a) ?? false)) &&
					!edge.clears.includes(a),
				(id, has) => id === node.id && !has,
			);
			if (flat.crossRun.has(a)) {
				add(
					"first-run-read",
					`${node.id} reads \`${a}\`, which is kept from earlier runs: on a first run nothing has written it yet`,
					trace,
				);
			} else {
				add(
					"read-before-write",
					`${node.id} reads \`${a}\`, which is not written on this path`,
					trace,
				);
			}
		}
	}
	for (const artifact of writers.keys()) {
		if (!readers.has(artifact) && !flat.crossRun.has(artifact)) {
			add(
				"never-read",
				`\`${artifact}\` is written by ${writers.get(artifact)?.join(", ")} and read by no step`,
				undefined,
				"warning",
			);
		}
	}

	// Claims that may still be held at an end.
	const claims = new Set(live.flatMap((node) => node.claims));
	for (const claim of claims) {
		const trace = witness(
			flat,
			out,
			false,
			(held, edge) => {
				const from = flat.nodes.get(edge.from);
				const taken = held || (from?.claims.includes(claim) ?? false);
				return taken && !from?.releases.includes(claim) && !edge.releases.includes(claim);
			},
			(id, held) => ends.has(id) && held,
		);
		if (trace) add("leaked-claim", `the claim \`${claim}\` is still held when the run ends`, trace);
	}

	// Every cycle must run out: peel bounded routes whose counter nothing in the same cycle sets back.
	let edges = flat.edges.filter((edge) => flat.nodes.has(edge.to) && reachable.has(edge.from));
	const ids = live.map((node) => node.id);
	for (;;) {
		const cyclic = components(ids, edges)
			.map((component) => new Set(component))
			.filter((set) => set.size > 1 || edges.some((e) => set.has(e.from) && e.to === e.from));
		const removed = new Set<Edge>();
		const stuck: Set<string>[] = [];
		for (const set of cyclic) {
			const inside = edges.filter((e) => set.has(e.from) && set.has(e.to));
			const reset = new Set(inside.flatMap((e) => e.resets));
			const removable = inside.filter((e) => e.bound && !reset.has(e.bound.counter));
			for (const edge of removable) removed.add(edge);
			if (removable.length === 0) stuck.push(set);
		}
		if (removed.size > 0) {
			edges = edges.filter((edge) => !removed.has(edge));
			continue;
		}
		for (const set of stuck) {
			const inside = edges.filter((e) => set.has(e.from) && set.has(e.to));
			const free = cycle(
				set,
				inside.filter((e) => !e.bound),
			);
			if (free) {
				add("unbounded-cycle", "this loop has no bound, so the run may never end", free);
				continue;
			}
			const bounded = inside.filter((e) => e.bound);
			const lines = bounded.map((e) => {
				const by = inside.find((other) => other.resets.includes(e.bound?.counter ?? ""));
				return `${e.from}.${e.outcome} is bounded, but ${by?.from}.${by?.outcome} sets its count back`;
			});
			add(
				"bounds-reset",
				`the bounds of this loop reset each other, so the run may never end: ${lines.join("; ")}`,
				cycle(set, inside),
			);
		}
		break;
	}

	// Capabilities the steps need from the chosen implementations.
	const emulated = new Map<string, string[]>();
	const needs = (need: string, where: string) => {
		const [componentId = "", capability = ""] = need.split(".");
		const component = flat.components.get(componentId);
		const level = component?.capabilities.get(capability);
		if (!component)
			add(
				"missing-capability",
				`${where} needs \`${need}\`, and the stack has no component \`${componentId}\``,
			);
		else if (level === undefined)
			add(
				"missing-capability",
				`${where} needs \`${need}\`, which \`${component.impl}\` does not declare`,
			);
		else if (level === "missing")
			add(
				"missing-capability",
				`${where} needs \`${need}\`, which \`${component.impl}\` cannot provide`,
			);
		else if (level === "emulated") emulated.set(need, [...(emulated.get(need) ?? []), where]);
	};
	for (const node of live) for (const need of node.needs) needs(need, node.id);

	// Whole-stack rules.
	const routers = [...flat.blocks].filter(([, block]) => block.role === "router");
	if (routers.length > 1)
		add(
			"two-routers",
			`more than one block routes the stack: ${routers.map(([id]) => id).join(", ")}`,
		);
	const group = (
		key: (block: { as: string; kind: string; event?: string }) => string | undefined,
	) => {
		const groups = new Map<string, string[]>();
		for (const [id, block] of flat.blocks) {
			const k = key(block);
			if (k !== undefined) groups.set(k, [...(groups.get(k) ?? []), id]);
		}
		return [...groups].filter(([, members]) => members.length > 1);
	};
	for (const [name, members] of group((b) => b.as))
		add("name-clash", `${members.join(" and ")} are both installed as \`${name}\``);
	for (const [event, members] of group((b) => (b.kind === "hook" ? b.event : undefined))) {
		add("hook-clash", `${members.join(" and ")} both hook the event \`${event}\``);
	}

	// Checks against the blocks' own annotations.
	if (annotations) {
		for (const id of flat.blocks.keys()) {
			const annotation = annotations.get(id);
			if (!annotation) {
				add("invalid", `block \`${id}\` has no annotation`);
				continue;
			}
			for (const touch of annotation.touches) {
				const component = flat.components.get(touch.component);
				if (!component)
					add(
						"invalid",
						`block \`${id}\` touches \`${touch.component}\`, which the stack does not choose`,
					);
				else if (touch.impl !== component.impl && !component.replaces.includes(touch.impl)) {
					add(
						"invalid",
						`block \`${id}\` was written for ${touch.component} \`${touch.impl}\`; the stack neither chooses it nor lists it under \`replaces\``,
					);
				}
			}
			for (const need of annotation.needs) needs(need, `block \`${id}\``);
		}
		for (const node of live) {
			const annotation = node.block ? annotations.get(node.block) : undefined;
			if (!annotation) continue;
			const part = node.part ? annotation.parts.get(node.part) : undefined;
			if (node.part && !part) {
				add(
					"invalid",
					`${node.id} uses part \`${node.part}\` of \`${node.block}\`, which its annotation does not define`,
				);
				continue;
			}
			const declared = new Set((part?.outcomes ?? annotation.outcomes).map(norm));
			const routed = new Set(
				(out.get(node.id) ?? []).map((edge) =>
					edge.outcome === ALL_DONE ? norm(flat.ends[0] ?? "") : norm(edge.outcome),
				),
			);
			for (const outcome of declared) {
				if (!routed.has(outcome))
					add(
						"unrouted-outcome",
						`\`${node.block}${node.part ? `#${node.part}` : ""}\` can end \`${outcome}\`, and ${node.id} does not route it`,
					);
			}
			if (declared.size === 0) continue;
			for (const outcome of routed) {
				if (outcome !== NEXT_CHILD && !declared.has(outcome)) {
					add(
						"undeclared-outcome",
						`${node.id} routes \`${outcome}\`, which \`${node.block}\` does not say it can end with`,
						undefined,
						"warning",
					);
				}
			}
		}
	}
	for (const [need, where] of emulated) {
		add(
			"emulated-capability",
			`\`${need}\` is emulated by \`${flat.components.get(need.split(".")[0] ?? "")?.impl}\` (needed by ${[...new Set(where)].join(", ")})`,
			undefined,
			"warning",
		);
	}
	return findings;
}
