import { describe, expect, test } from "bun:test";
import { scan, utf8 } from "../src/marks.ts";

const messages = (text: string) => scan(text).problems.map((problem) => problem.message);

describe("reading marks", () => {
	test("a text without marks is its own original", () => {
		const text = "# Title\n\nNothing to see: a < b, and </p> is not ours.\n";
		const scanned = scan(text);
		expect(scanned.original).toBe(text);
		expect(scanned.marks).toEqual([]);
		expect(scanned.problems).toEqual([]);
		expect(scanned.header).toBeUndefined();
		expect(scanned.headerLines).toBe(0);
	});

	test("taking the tags out gives the original, with each mark's place in it", () => {
		const scanned = scan('Use <fs:ref to="a/b">the <fs:name>b</fs:name> skill</fs:ref> now.\n');
		expect(scanned.original).toBe("Use the b skill now.\n");
		expect(scanned.problems).toEqual([]);
		const [ref, name] = scanned.marks;
		expect(ref?.tag).toBe("ref");
		expect(ref?.attrs).toEqual({ to: "a/b" });
		expect(scanned.original.slice(ref?.start, ref?.end)).toBe("the b skill");
		expect(name?.tag).toBe("name");
		expect(scanned.original.slice(name?.start, name?.end)).toBe("b");
		expect(name?.parent).toBe(ref);
		expect(ref?.parent).toBeUndefined();
	});

	test("a mark knows the line of its opening tag in the file with marks", () => {
		const scanned = scan('one\ntwo\n<fs:artifact name="plan">three\nfour</fs:artifact>\n');
		expect(scanned.marks[0]?.line).toBe(3);
		expect(scanned.original).toBe("one\ntwo\nthree\nfour\n");
	});

	test("an empty mark is kept, with no text", () => {
		const scanned = scan('a<fs:concept name="Task"></fs:concept>b');
		expect(scanned.original).toBe("ab");
		expect(scanned.marks[0]?.start).toBe(1);
		expect(scanned.marks[0]?.end).toBe(1);
	});

	test("attribute values are read as real text, the original stays byte for byte", () => {
		const bytes = Buffer.from(
			'<fs:uses concept="TaskStorage" purpose="é">café</fs:uses>',
			"utf8",
		).toString("latin1");
		const scanned = scan(bytes);
		expect(scanned.marks[0]?.attrs.purpose).toBe("é");
		expect(utf8(scanned.original)).toBe("café");
		expect(scanned.original).toHaveLength(5);
	});
});

describe("the header", () => {
	test("is taken out with the line break after it", () => {
		const scanned = scan("<fs:block>\nkind: skill\n</fs:block>\n# Title\n");
		expect(scanned.header).toBe("\nkind: skill\n");
		expect(scanned.original).toBe("# Title\n");
		expect(scanned.headerLines).toBe(3);
		expect(scanned.problems).toEqual([]);
	});

	test("a Windows line break after it is taken out whole", () => {
		const scanned = scan("<fs:block>\r\nkind: skill\r\n</fs:block>\r\n# Title\r\n");
		expect(scanned.original).toBe("# Title\r\n");
		expect(scanned.headerLines).toBe(3);
	});

	test("line numbers of marks count the header's lines", () => {
		const scanned = scan(
			'<fs:block>\nkind: skill\n</fs:block>\nx\n<fs:part name="gate">y</fs:part>\n',
		);
		expect(scanned.marks[0]?.line).toBe(5);
	});

	test("a header that ends the file is fine", () => {
		expect(scan("<fs:block>\nkind: skill\n</fs:block>").problems).toEqual([]);
	});

	test("text on the line of the closing tag is reported", () => {
		expect(messages("<fs:block>\nkind: skill\n</fs:block># Title\n")).toEqual([
			"`</fs:block>` must be followed by a line break",
		]);
	});

	test("a header that is not closed is reported, and the text is left alone", () => {
		const text = "<fs:block>\nkind: skill\n# Title\n";
		const scanned = scan(text);
		expect(scanned.problems.map((problem) => problem.message)).toEqual([
			"`<fs:block>` is not closed",
		]);
		expect(scanned.original).toBe(text);
		expect(scanned.header).toBeUndefined();
	});

	test("a header anywhere but the very start is reported", () => {
		expect(messages("# Title\n<fs:block>\nkind: skill\n</fs:block>\n")).toEqual([
			"`<fs:block>` can only be the very start of a block's main file",
		]);
	});
});

describe("marks that are not written as the format says", () => {
	test("a tag that is not closed", () => {
		const scanned = scan('one\n<fs:artifact name="plan">two\n');
		expect(scanned.problems).toEqual([{ line: 2, message: "`<fs:artifact>` is not closed" }]);
		expect(scanned.original).toBe("one\ntwo\n");
		expect(scanned.marks[0]?.end).toBe(scanned.original.length);
	});

	test("a closing tag that closes nothing", () => {
		expect(messages("one</fs:ref> two")).toEqual(["`</fs:ref>` closes nothing"]);
	});

	test("marks that overlap", () => {
		const scanned = scan(
			'<fs:ref to="a/b">one <fs:concept name="Task">two</fs:ref> three</fs:concept>',
		);
		expect(scanned.problems.map((problem) => problem.message)).toEqual([
			"`</fs:ref>` closes while `<fs:concept>` (line 1) is still open: marks cannot overlap",
			"`</fs:concept>` closes nothing",
		]);
		expect(scanned.original).toBe("one two three");
	});

	test("an unknown tag is taken out and reported", () => {
		const scanned = scan("a <fs:word>b</fs:word> c");
		expect(scanned.problems.map((problem) => problem.message)).toEqual([
			"unknown tag `fs:word`",
			"unknown tag `fs:word`",
		]);
		expect(scanned.original).toBe("a b c");
		expect(scanned.marks).toEqual([]);
	});

	test("something that starts like a tag and is not one stays in the text", () => {
		const scanned = scan("a <fs:ref to='x'>b");
		expect(scanned.problems.map((problem) => problem.message)).toEqual([
			"`<fs:` starts a tag that is not written as the format says",
		]);
		expect(scanned.original).toBe("a <fs:ref to='x'>b");
	});

	test("a missing, an unknown, an empty and a repeated attribute", () => {
		expect(messages("<fs:ref>x</fs:ref>")).toEqual(["`<fs:ref>` needs `to`"]);
		expect(messages('<fs:ref to="a/b" kind="skill">x</fs:ref>')).toEqual([
			"`<fs:ref>` has no attribute `kind`",
		]);
		expect(messages('<fs:ref to=" ">x</fs:ref>')).toEqual(["`<fs:ref>`: `to` is empty"]);
		expect(messages('<fs:ref to="a/b" to="c/d">x</fs:ref>')).toEqual([
			"`<fs:ref>` gives `to` twice",
		]);
	});

	test("`fs:uses` takes a verb or a purpose, one of the two", () => {
		const problem = "`<fs:uses>` takes `verb` or `purpose`, one of the two";
		expect(messages('<fs:uses concept="Memory">x</fs:uses>')).toEqual([problem]);
		expect(messages('<fs:uses concept="Memory" verb="read" purpose="why">x</fs:uses>')).toEqual([
			problem,
		]);
		expect(messages('<fs:uses concept="Memory" verb="read">x</fs:uses>')).toEqual([]);
		expect(
			messages('<fs:uses concept="Memory" purpose="says where lessons go">x</fs:uses>'),
		).toEqual([]);
	});

	test("`fs:name` and `fs:path` only go inside their own mark", () => {
		expect(messages("<fs:name>x</fs:name>")).toEqual(["`<fs:name>` must be inside `<fs:ref>`"]);
		expect(messages("<fs:path>x</fs:path>")).toEqual([
			"`<fs:path>` must be inside `<fs:artifact>`",
		]);
		expect(messages('<fs:ref to="a/b"><fs:path>x</fs:path></fs:ref>')).toEqual([
			"`<fs:path>` must be inside `<fs:artifact>`",
		]);
		expect(
			messages(
				'<fs:artifact name="plan"><fs:concept name="Task"><fs:path>x</fs:path></fs:concept></fs:artifact>',
			),
		).toEqual([]);
	});

	test("every tag of the format is read", () => {
		const text = [
			'<fs:ref to="a/b"><fs:name>b</fs:name></fs:ref>',
			'<fs:uses concept="Memory" verb="read">r</fs:uses>',
			'<fs:concept name="Task">t</fs:concept>',
			'<fs:route outcome="done" to="a/c">go</fs:route>',
			'<fs:artifact name="plan"><fs:path>p.md</fs:path></fs:artifact>',
			'<fs:part name="gate">g</fs:part>',
		].join("\n");
		const scanned = scan(text);
		expect(scanned.problems).toEqual([]);
		expect(scanned.marks.map((mark) => mark.tag)).toEqual([
			"ref",
			"name",
			"uses",
			"concept",
			"route",
			"artifact",
			"path",
			"part",
		]);
	});
});
