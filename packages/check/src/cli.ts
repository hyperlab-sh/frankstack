#!/usr/bin/env bun
import { statSync } from "node:fs";
import { join } from "node:path";
import { analyze } from "./analyze.ts";
import { checkAssembled } from "./assembled.ts";
import { loadBundle } from "./bundle.ts";
import { loadStack } from "./load.ts";
import type { Finding, Flat } from "./types.ts";

const USAGE = `frankstack-check stack <bundle folder | stack.yaml>
frankstack-check expand <bundle folder | stack.yaml>
frankstack-check assembled <plugin folder> --bundle <bundle folder>`;

function report(findings: Finding[]): number {
	for (const finding of findings) {
		console.log(`${finding.severity.padEnd(7)} ${finding.rule}: ${finding.message}`);
		for (const line of finding.trace ?? []) console.log(`          ${line}`);
	}
	const errors = findings.filter((finding) => finding.severity === "error").length;
	console.log(`${errors} error(s), ${findings.length - errors} warning(s)`);
	return errors > 0 ? 1 : 0;
}

function expand(flat: Flat): void {
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

async function main(args: string[]): Promise<number> {
	const [command, target] = args;
	if (!command || !target || !["stack", "expand", "assembled"].includes(command)) {
		console.error(USAGE);
		return 64;
	}
	const flag = args.indexOf("--bundle");
	const bundleDir =
		command === "assembled" ? args[flag + 1] : statSync(target).isDirectory() ? target : undefined;
	if (command === "assembled" && (flag < 0 || !bundleDir)) {
		console.error(USAGE);
		return 64;
	}
	const stackFile = bundleDir ? join(bundleDir, "stack.yaml") : target;
	const { flat, findings } = loadStack(await Bun.file(stackFile).text());
	if (!flat) return report(findings);
	if (command === "expand") {
		expand(flat);
		return 0;
	}
	const bundle = bundleDir ? await loadBundle(bundleDir) : undefined;
	findings.push(...(bundle?.findings ?? []), ...analyze(flat, bundle?.annotations));
	if (command === "assembled" && bundle) {
		if (findings.some((finding) => finding.severity === "error")) {
			console.log("the stack itself has errors; fix those first");
			return report(findings);
		}
		return report(await checkAssembled(target, flat, bundle));
	}
	return report(findings);
}

process.exit(await main(process.argv.slice(2)));
