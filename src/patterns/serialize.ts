import { SwilibPattern } from "#src/patterns/parse.js";

export function serializePatterns(patterns: SwilibPattern[]): string {
	const lines = [`[Library]`];
	for (let idStr in patterns) {
		const id = +idStr;

		if (id && (id % 16) == 0)
			lines.push("");

		const idHex = id.toString(16).padStart(2, '0').toUpperCase();
		let ptr = patterns[id];
		if (!ptr) {
			lines.push(`${idHex}:`);
		} else if (ptr.pattern) {
			lines.push(`${idHex}:${ptr.name.replace(/\s+/gs, ' ')} = ${ptr.pattern}`);
		} else {
			lines.push(`${idHex}:${ptr.name.replace(/\s+/gs, ' ')}`);
		}
	}
	lines.push("");
	return lines.join("\n");
}
