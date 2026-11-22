export type Severity = "error" | "warning";

export type Finding = {
	rule: string;
	severity: Severity;
	message: string;
	/** The flow the finding is about, when it is about one. */
	flow?: string;
	/** A concrete path through the flow that shows the problem. */
	trace?: string[];
};

export type Read = { artifact: string; optional: boolean };

/** One step at one level (a cell), after the levels are written out. */
export type Node = {
	id: string;
	/** Index into `Flat.levels`. */
	level: number;
	step: string;
	block?: string;
	part?: string;
	/** Made by the expansion (a child that ended another way), not written in the flow. */
	synthetic: boolean;
	/** Runs the flow one level down. */
	descends: boolean;
	/** The ends of a child this cell routes with `children`. */
	childRoutes: string[];
	/** Input of the block to the artifact the cell gives for it. */
	inputs: Map<string, string>;
	/** Output of the block to the artifact the cell keeps it as. */
	outputs: Map<string, string>;
	/** Everything read here: the lead's own `reads` and the block's inputs. */
	reads: Read[];
	/** Everything written here: the lead's own `writes` and the block's outputs. */
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

/** One flow of a bundle with its levels written out. */
export type Flat = {
	name: string;
	lead: string;
	levels: string[];
	start: string;
	ends: string[];
	inputs: Set<string>;
	crossRun: Set<string>;
	/** The kind of each artifact, by its name without a level. */
	kinds: Map<string, string>;
	/** Where an artifact is kept: keyed `name@level`, or `name` when one path serves every level. */
	paths: Map<string, string>;
	/** Levels the lead does not run: level name to the block that runs it. */
	inside: Map<string, string>;
	nodes: Map<string, Node>;
	edges: Edge[];
};

/** An input, an output or a reference a block declares. */
export type Io = { kind: string; required: boolean };

/** What a block's text relies on for one concept. */
export type Use = {
	/** The block id or the stack the text was written for. A created block has none. */
	writtenFor?: string;
	verbs: string[];
	names: string[];
	needs: string[];
};

/** A provider's word for a concept: for one of them, and for several when no rule gives it. */
export type Name = { one: string; many?: string };

/** What a block gives for one concept it provides. */
export type Provide = {
	/** Verb to its sentence. A created block has no sentence yet: the assembler writes it. */
	verbs: Map<string, string | undefined>;
	/** Named concept to what this provider calls it. */
	names: Map<string, Name>;
	traits: string[];
	fingerprints: string[];
};

/** What a block is, in the terms of the language: a header, or the entry of a created block. */
export type Definition = {
	kind: string;
	does: string;
	references: Map<string, Io>;
	uses: Map<string, Use>;
	provides: Map<string, Provide>;
	inputs: Map<string, Io>;
	outputs: Map<string, Io>;
	outcomes: string[];
	/** Part to the outcomes it can end with. */
	parts: Map<string, string[]>;
};

export type Source = { repo: string; commit: string; path: string };

export type Header = Definition & {
	/** `<stack>/<block>`: what texts written for this block name under `written-for`. */
	id?: string;
	source?: Source;
	/** File name to the SHA-256 of its original. */
	files: Map<string, string>;
};

/** One mark in a block's text. */
export type Mark = {
	tag: string;
	attrs: Record<string, string>;
	/** The line of its opening tag in the file with marks. */
	line: number;
	/** Where its content is in the text without marks. */
	start: number;
	end: number;
	parent?: Mark;
};

export type FileMark = Mark & { file: string };

/** A block's folder, read. */
export type Block = {
	header?: Header;
	/** The file that starts with the header. */
	main?: string;
	/** The lines the header takes in the main file: a line of its text is that much further down. */
	headerLines: number;
	/** File name to its text without marks, one character per byte. */
	originals: Map<string, string>;
	marks: FileMark[];
	findings: Finding[];
};

/** A block as `bundle.yaml` lists it. */
export type BundleBlock = {
	name: string;
	origin: "catalog" | "imported" | "created";
	/** The block's id in the catalog. */
	from?: string;
	references: Map<string, string | null>;
	event?: string;
	/** The header of the block's folder, or the definition of a created block. */
	def?: Definition;
	loaded?: Block;
};

/** What a bundle says about one concept: the block that provides it, or the stack whose text stays. */
export type Choice = { block: string } | { asWritten: string };

export type Bundle = {
	name: string;
	target: string;
	concepts: Map<string, Choice>;
	/** Artifacts kept between runs, with their kind. */
	crossRun: Map<string, string>;
	blocks: Map<string, BundleBlock>;
	flows: Flat[];
};
