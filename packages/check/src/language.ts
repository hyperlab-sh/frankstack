/**
 * Frankstack's language, as `docs/language.md` lists it. That file is the only place the lists are
 * defined; `tests/language.test.ts` fails when this copy differs from it.
 */

/** Concepts a block provides, with their verbs and traits. */
export const PROVIDED = new Map<string, { verbs: string[]; traits: string[] }>([
	[
		"TaskStorage",
		{
			verbs: [
				"create",
				"list",
				"read-task",
				"ready-queue",
				"claim",
				"mark-done",
				"dependencies",
				"cite",
			],
			traits: [],
		},
	],
	["Memory", { verbs: ["search", "read", "write", "update", "delete"], traits: [] }],
	["Decisions", { verbs: ["read", "write", "cite"], traits: ["numbered"] }],
	["Requirement", { verbs: ["list", "cite", "verdict"], traits: ["stable-ids"] }],
	[
		"Executor",
		{
			verbs: ["dispatch", "result"],
			traits: ["fresh-context", "parallel", "cross-model-review", "resume"],
		},
	],
	["Routing", { verbs: ["report"], traits: [] }],
]);

/** The concept the target settles; no block provides it. */
export const HARNESS = "Harness";
export const HARNESS_TRAITS = ["skills", "subagents", "hooks"];

/** Concepts a provider names, with the concept whose provider names them. */
export const NAMED = new Map<string, string>([
	["Task", "TaskStorage"],
	["TaskId", "TaskStorage"],
	["TaskDefinition", "TaskStorage"],
	["Criterion", "Requirement"],
	["CriterionId", "Requirement"],
	["Lesson", "Memory"],
	["Decision", "Decisions"],
	["DecisionId", "Decisions"],
]);

export const ARTIFACT_KINDS = [
	"request",
	"requirements",
	"baseline",
	"design",
	"questions",
	"plan",
	"change",
	"report",
	"findings",
	"verdict",
	"handoff",
	"lessons",
	"decisions",
];

export const BLOCK_KINDS = ["skill", "agent", "prompt", "script", "hook", "playbook", "resource"];

/** Targets an assembly can be installed into, with the `Harness` traits each has. */
export const TARGETS = new Map<string, string[]>([
	["claude-code-plugin", ["skills", "subagents", "hooks"]],
]);

/** Any concept of the language: what a `fs:concept` mark may name. */
export const isConcept = (name: string): boolean =>
	PROVIDED.has(name) || name === HARNESS || NAMED.has(name) || ARTIFACT_KINDS.includes(name);

/** The verbs of a concept a text can use; undefined when it is not such a concept. */
export const verbsOf = (concept: string): string[] | undefined =>
	concept === HARNESS ? [] : PROVIDED.get(concept)?.verbs;

export const traitsOf = (concept: string): string[] | undefined =>
	concept === HARNESS ? HARNESS_TRAITS : PROVIDED.get(concept)?.traits;
