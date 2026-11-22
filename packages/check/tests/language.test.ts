import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	ARTIFACT_KINDS,
	BLOCK_KINDS,
	HARNESS,
	HARNESS_TRAITS,
	isConcept,
	NAMED,
	PROVIDED,
	traitsOf,
	verbsOf,
} from "../src/language.ts";

const DOC = readFileSync(join(import.meta.dir, "../../../docs/language.md"), "utf8");

/** The rows of the table under a heading, as cells. */
function table(heading: string): string[][] {
	const from = DOC.indexOf(`### ${heading}\n`);
	expect(from).toBeGreaterThanOrEqual(0);
	const lines = DOC.slice(from).split("\n");
	const first = lines.findIndex((line) => line.startsWith("|"));
	const rows: string[][] = [];
	for (const line of lines.slice(first)) {
		if (!line.startsWith("|")) break;
		rows.push(
			line
				.slice(1, -1)
				.split("|")
				.map((cell) => cell.trim()),
		);
	}
	return rows.slice(2);
}
const coded = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");

describe("the language the checker knows is the one docs/language.md lists", () => {
	test("concepts a block provides, with their verbs and traits", () => {
		const rows = table("Concepts a block provides");
		expect(rows.map((row) => coded(row[0] ?? "")[0])).toEqual([...PROVIDED.keys()]);
		for (const [concept, , verbs = "", traits = ""] of rows) {
			const known = PROVIDED.get(coded(concept ?? "")[0] ?? "");
			expect(coded(verbs)).toEqual(known?.verbs ?? []);
			expect(coded(traits)).toEqual(known?.traits ?? []);
		}
	});

	test("concepts a provider names", () => {
		const rows = table("Concepts a provider names");
		expect(rows.map((row) => [coded(row[0] ?? "")[0], coded(row[2] ?? "")[0]])).toEqual([
			...NAMED.entries(),
		]);
	});

	test("artifact kinds", () => {
		expect(table("Artifact kinds").map((row) => coded(row[0] ?? "")[0])).toEqual(ARTIFACT_KINDS);
	});

	test("block kinds", () => {
		const sentence = /Its \*\*kind\*\* is one of:([\s\S]*?)\n- \*\*/.exec(DOC)?.[1] ?? "";
		expect(coded(sentence)).toEqual(BLOCK_KINDS);
	});

	test("the traits of the harness", () => {
		const sentence = /Its traits are ([^\n]*)\./.exec(DOC)?.[1] ?? "";
		expect(coded(sentence)).toEqual(HARNESS_TRAITS);
	});
});

describe("looking a term up", () => {
	test("every listed name is a concept, and nothing else is", () => {
		for (const name of ["TaskStorage", "Routing", HARNESS, "TaskId", "handoff", "plan"])
			expect(isConcept(name)).toBe(true);
		for (const name of ["Handoff", "taskstorage", "Bead", ""]) expect(isConcept(name)).toBe(false);
	});

	test("the harness has traits and no verbs", () => {
		expect(verbsOf(HARNESS)).toEqual([]);
		expect(traitsOf(HARNESS)).toEqual(["skills", "subagents", "hooks"]);
	});

	test("a named concept or an artifact kind has no verbs of its own", () => {
		expect(verbsOf("Task")).toBeUndefined();
		expect(traitsOf("plan")).toBeUndefined();
		expect(verbsOf("Routing")).toEqual(["report"]);
	});
});
