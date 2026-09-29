import toml, { stringify, TomlTable, TomlValue } from "smol-toml";

export function prettifyPatterns(code: string): string {
	const document = toml.parse(code);
	const platforms = document["platforms"];
	if (!isTomlTable(platforms))
		throw new Error('patterns.toml has no platforms table.');

	const sections = [stringify({ platforms }).trim()];
	const patterns = Object.entries(document)
		.filter(([id]) => id !== "platforms")
		.sort(([left], [right]) => parseInt(left, 16) - parseInt(right, 16));

	for (const [id, pattern] of patterns) {
		if (!/^[0-9a-f]+$/i.test(id) || !isTomlTable(pattern))
			throw new Error(`Invalid pattern: ${id}`);
		sections.push(formatPatternStrings(stringify({ [id]: pattern }).trim(), pattern));
	}

	return `${sections.join("\n\n")}\n`;
}

function formatPatternStrings(code: string, pattern: TomlTable): string {
	for (const [scope, value] of Object.entries(pattern)) {
		if (scope === "decl" || scope.startsWith("decl_") || typeof value !== "string")
			continue;

		const assignment = stringify({ [scope]: value }).trim();
		if (assignment.length <= 120 || /["\\\r\n]/.test(value))
			continue;

		const prefix = assignment.slice(0, -JSON.stringify(value).length);
		const lines = value.match(/.{1,108}/g)!;
		code = code.replace(assignment, `${prefix}"""\n${lines.join("\n")}\n"""`);
	}
	return code;
}

function isTomlTable(value: TomlValue | undefined): value is TomlTable {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}
