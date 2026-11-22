import type { Mark } from "./types.ts";

/** The attributes each tag takes, and the tag it must be inside of. */
const TAGS = new Map<string, { required: string[]; optional: string[]; inside?: string }>([
	["block", { required: [], optional: [] }],
	["ref", { required: ["to"], optional: [] }],
	["name", { required: [], optional: [], inside: "ref" }],
	["uses", { required: ["concept"], optional: ["verb", "purpose"] }],
	["concept", { required: ["name"], optional: [] }],
	["route", { required: ["outcome", "to"], optional: [] }],
	["artifact", { required: ["name"], optional: [] }],
	["path", { required: [], optional: [], inside: "artifact" }],
	["part", { required: ["name"], optional: [] }],
]);

const HEADER_OPEN = "<fs:block>";
const HEADER_CLOSE = "</fs:block>";
const ANY = /<\/?fs:/g;
const OPEN = /<fs:([A-Za-z][\w-]*)((?:[ \t]+[a-z][a-z-]*="[^"<>\r\n]*")*)[ \t]*>/y;
const CLOSE = /<\/fs:([A-Za-z][\w-]*)>/y;
const ATTR = /([a-z][a-z-]*)="([^"<>\r\n]*)"/g;

/** Text read one character per byte, as real text. */
export const utf8 = (bytes: string): string => Buffer.from(bytes, "latin1").toString("utf8");

export type Scan = {
	marks: Mark[];
	/** The text with every tag taken out, and the header with the line break after it. */
	original: string;
	/** What is between `<fs:block>` and `</fs:block>`, when the text starts with a header. */
	header?: string;
	/** The lines the header takes, with its tags. */
	headerLines: number;
	problems: { line: number; message: string }[];
};

/**
 * Reads the marks of one file. `text` holds one character per byte (latin1), so that taking the
 * tags out gives the original bytes whatever the file's encoding is.
 */
export function scan(text: string): Scan {
	const problems: Scan["problems"] = [];
	const marks: Mark[] = [];
	const open: Mark[] = [];
	let original = "";
	let pos = 0;
	let header: string | undefined;
	let headerLines = 0;

	let counted = 0;
	let line = 1;
	const lineAt = (offset: number) => {
		for (; counted < offset; counted++) if (text[counted] === "\n") line++;
		return line;
	};
	const problem = (offset: number, message: string) => {
		problems.push({ line: lineAt(offset), message });
	};

	if (text.startsWith(HEADER_OPEN)) {
		const end = text.indexOf(HEADER_CLOSE);
		if (end < 0) {
			problem(0, "`<fs:block>` is not closed");
			return { marks, original: text, headerLines, problems };
		}
		header = text.slice(HEADER_OPEN.length, end);
		pos = end + HEADER_CLOSE.length;
		if (text.startsWith("\r\n", pos)) pos += 2;
		else if (text[pos] === "\n") pos += 1;
		else if (pos < text.length) problem(pos, "`</fs:block>` must be followed by a line break");
		headerLines = text.slice(0, pos).split("\n").length - 1;
	}

	ANY.lastIndex = pos;
	for (let found = ANY.exec(text); found; found = ANY.exec(text)) {
		const at = found.index;
		const closing = found[0] === "</fs:";
		original += text.slice(pos, at);
		const pattern = closing ? CLOSE : OPEN;
		pattern.lastIndex = at;
		const tag = pattern.exec(text);
		if (!tag) {
			// Not a tag the format knows how to read: it stays in the text, and is reported.
			problem(at, `\`${found[0]}\` starts a tag that is not written as the format says`);
			original += found[0];
			pos = at + found[0].length;
			continue;
		}
		pos = at + tag[0].length;
		ANY.lastIndex = pos;
		const name = tag[1] ?? "";
		const known = TAGS.get(name);
		if (!known) {
			problem(at, `unknown tag \`fs:${name}\``);
			continue;
		}
		if (closing) {
			let index = open.length - 1;
			while (index >= 0 && open[index]?.tag !== name) index--;
			if (index < 0) {
				problem(at, `\`</fs:${name}>\` closes nothing`);
				continue;
			}
			for (const left of open.splice(index + 1)) {
				problem(
					at,
					`\`</fs:${name}>\` closes while \`<fs:${left.tag}>\` (line ${left.line}) is still open: marks cannot overlap`,
				);
				left.end = original.length;
			}
			const mark = open.pop();
			if (mark) mark.end = original.length;
			continue;
		}
		if (name === "block")
			problem(at, "`<fs:block>` can only be the very start of a block's main file");
		const attrs: Record<string, string> = {};
		for (const [, key = "", value = ""] of (tag[2] ?? "").matchAll(ATTR)) {
			if (key in attrs) problem(at, `\`<fs:${name}>\` gives \`${key}\` twice`);
			else if (![...known.required, ...known.optional].includes(key))
				problem(at, `\`<fs:${name}>\` has no attribute \`${key}\``);
			else if (value.trim() === "") problem(at, `\`<fs:${name}>\`: \`${key}\` is empty`);
			attrs[key] = utf8(value);
		}
		for (const key of known.required) {
			if (!(key in attrs)) problem(at, `\`<fs:${name}>\` needs \`${key}\``);
		}
		if (name === "uses" && "verb" in attrs === "purpose" in attrs)
			problem(at, "`<fs:uses>` takes `verb` or `purpose`, one of the two");
		if (known.inside && !open.some((mark) => mark.tag === known.inside))
			problem(at, `\`<fs:${name}>\` must be inside \`<fs:${known.inside}>\``);
		const mark: Mark = {
			tag: name,
			attrs,
			line: lineAt(at),
			start: original.length,
			end: original.length,
			parent: open.at(-1),
		};
		marks.push(mark);
		open.push(mark);
	}
	original += text.slice(pos);
	for (const left of open) {
		problems.push({ line: left.line, message: `\`<fs:${left.tag}>\` is not closed` });
		left.end = original.length;
	}
	return { marks, original, header, headerLines, problems };
}
