export type Severity = "error" | "warning";

export type Finding = {
	rule: string;
	severity: Severity;
	message: string;
	/** A concrete path through the stack that shows the problem. */
	trace?: string[];
};

export type CapabilityLevel = "native" | "emulated" | "missing";

export type Read = { artifact: string; optional: boolean };

/** One step at one level, after the levels are written out. */
export type Node = {
	id: string;
	/** Index into `Flat.levels`. */
	level: number;
	step: string;
	block?: string;
	part?: string;
	/** Made by the expansion (a child that ended another way), not written in the stack. */
	synthetic: boolean;
	/** Runs the loop one level down. */
	descends: boolean;
	reads: Read[];
	writes: string[];
	claims: string[];
	releases: string[];
	needs: string[];
};

export type Bound = { counter: string; kind: "max" | "each"; max?: number };

export type Edge = {
	from: string;
	outcome: string;
	/** A node id or an end. */
	to: string;
	/** The route can be taken a limited number of times. */
	bound?: Bound;
	/** Taken when the bound of the same outcome is used up. */
	exhausted: boolean;
	releases: string[];
	/** Artifacts that no longer count as written after this edge. */
	clears: string[];
	/** Counters set back to zero by this edge. */
	resets: string[];
};

/** The component the stack uses for one type (`Memory`, `TaskStorage`, ...). */
export type Component = {
	/** Bundle-relative path of its card: `components/<Type>/<name>.md`. */
	use: string;
	name: string;
	capabilities: Map<string, CapabilityLevel>;
};

export type BlockUse = { kind: string; as: string; role?: string; event?: string };

export type Flat = {
	name: string;
	levels: string[];
	start: string;
	ends: string[];
	inputs: Set<string>;
	crossRun: Set<string>;
	components: Map<string, Component>;
	blocks: Map<string, BlockUse>;
	/** Where an artifact is kept: keyed `name@level`, or `name` when one path serves every level. */
	paths: Map<string, string>;
	/** Levels the lead does not run: level name to the block that runs it. */
	inside: Map<string, string>;
	nodes: Map<string, Node>;
	edges: Edge[];
};

/** What the checker needs from a block annotation. */
export type Annotation = {
	block: string;
	files: string[];
	outcomes: string[];
	parts: Map<string, { lines: string; outcomes: string[] }>;
	/** `component` is the path of the card the text was written for. */
	touches: { component: string; file?: string; lines: string }[];
	/** Lines listed under `refers` and `other`: text the assembler may also have to change. */
	mentions: { file?: string; lines: string }[];
	needs: string[];
	rewrite?: string;
};

export type Card = {
	path: string;
	type: string;
	name: string;
	capabilities: Map<string, CapabilityLevel>;
	fingerprints: string[];
};
