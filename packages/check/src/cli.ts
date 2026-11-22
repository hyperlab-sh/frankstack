#!/usr/bin/env bun
import { checkAssembled } from "./assembled.ts";
import { isDir, loadBundle } from "./bundle.ts";
import { checkCatalog } from "./catalog.ts";
import type { Finding, Flat } from "./types.ts";

const USAGE = `frankstack-check bundle <bundle folder>
frankstack-check expand <bundle folder>
frankstack-check assembled <assembly folder> --bundle <bundle folder> [--catalog <catalog folder>]
frankstack-check catalog <stack folder> --source <clone of the stack's repository>`;

function report(findings: Finding[]): number {
	for (const finding of findings) {
		const flow = finding.flow === undefined ? "" : `flow \`${finding.flow}\`: `;
		console.log(`${finding.severity.padEnd(7)} ${finding.rule}: ${flow}${finding.message}`);
		for (const line of finding.trace ?? []) console.log(`          ${line}`);
	}
	const errors = findings.filter((finding) => finding.severity === "error").length;
	console.log(`${errors} error(s), ${findings.length - errors} warning(s)`);
	return errors > 0 ? 1 : 0;
}

function expand(flat: Flat): void {
	console.log(`flow ${flat.name}`);
	for (const node of flat.nodes.values()) {
		const block = node.block ? `  [${node.block}${node.part ? `#${node.part}` : ""}]` : "";
		console.log(`${node.id}${block}`);
		const reads = node.reads.map((read) => (read.optional ? `${read.artifact}?` : read.artifact));
		if (reads.length > 0) console.log(`  reads ${reads.join(", ")}`);
		if (node.writes.length > 0) console.log(`  writes ${node.writes.join(", ")}`);
		if (node.claims.length > 0) console.log(`  claims ${node.claims.join(", ")}`);
		for (const edge of flat.edges.filter((e) => e.from === node.id)) {
			const bound = edge.bound
				? edge.bound.kind === "max"
					? ` (at most ${edge.bound.max} times)`
					: " (once per child)"
				: "";
			const after = edge.exhausted ? " (after that)" : "";
			const releases = edge.releases.length > 0 ? ` releases ${edge.releases.join(", ")}` : "";
			console.log(`  ${edge.outcome} -> ${edge.to}${bound}${after}${releases}`);
		}
	}
}

/** The value after a flag; undefined when the flag is not given, null when it has no value. */
function option(args: string[], flag: string): string | null | undefined {
	const at = args.indexOf(flag);
	if (at < 0) return undefined;
	const value = args[at + 1];
	return value === undefined || value.startsWith("--") ? null : value;
}

function main(args: string[]): number {
	const [command, target] = args;
	if (!command || !target || !["bundle", "expand", "assembled", "catalog"].includes(command)) {
		console.error(USAGE);
		return 64;
	}
	const bundleDir = command === "assembled" ? option(args, "--bundle") : target;
	const catalog = command === "assembled" ? option(args, "--catalog") : undefined;
	const source = command === "catalog" ? option(args, "--source") : undefined;
	if (
		(command === "assembled" && !bundleDir) ||
		catalog === null ||
		(command === "catalog" && !source)
	) {
		console.error(USAGE);
		return 64;
	}
	for (const path of [target, bundleDir, catalog, source]) {
		if (typeof path === "string" && !isDir(path)) {
			console.error(`${path}: no such folder`);
			return 64;
		}
	}
	if (command === "catalog") return report(checkCatalog(target, source ?? ""));

	const { bundle, findings } = loadBundle(bundleDir ?? target);
	if (command === "expand") {
		for (const flat of bundle?.flows ?? []) expand(flat);
		// A flow that could not be read is not printed: say why instead of leaving it out unseen.
		const read = new Set(bundle?.flows.map((flat) => flat.name));
		const unread = findings.filter(
			(finding) =>
				finding.severity === "error" &&
				(finding.flow === undefined ? !bundle : !read.has(finding.flow)),
		);
		return unread.length > 0 ? report(unread) : 0;
	}
	if (command === "bundle") return report(findings);
	if (!bundle || findings.some((finding) => finding.severity === "error")) {
		console.log("the bundle itself has errors; fix those first");
		return report(findings);
	}
	return report(checkAssembled(target, bundle, bundleDir ?? "", catalog ?? undefined));
}

process.exit(main(process.argv.slice(2)));
