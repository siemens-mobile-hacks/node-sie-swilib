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
		if (scope === "decl" || scope.startsWith("decl_"))
			continue;

		if (typeof value === "string") {
			const assignment = stringify({ [scope]: value }).trim();
			code = code.replace(assignment, formatStringAssignment(assignment, value));
		} else if (isStringArray(value)) {
			const assignment = stringify({ [scope]: value }).trim();
			if (assignment.length > 120) {
				const prefix = stringify({ [scope]: [] }).trim().slice(0, -2);
				const candidates = value.map(formatArrayCandidate).join("\n");
				code = code.replace(assignment, `${prefix}[\n${candidates}\n]`);
			}
		}
	}
	return code;
}

function formatStringAssignment(assignment: string, value: string): string {
	if (assignment.length <= 120 || /["\\\r\n]/.test(value))
		return assignment;
	const encoded = tomlString(value);
	return `${assignment.slice(0, -encoded.length)}${multilineString(value)}`;
}

function formatArrayCandidate(value: string): string {
	const encoded = tomlString(value);
	if (`\t${encoded},`.length <= 120 || /["\\\r\n]/.test(value))
		return `\t${encoded},`;
	return `\t${multilineString(value)},`;
}

function multilineString(value: string): string {
	return `"""\n${value.match(/.{1,108}/g)!.join("\n")}\n"""`;
}

function tomlString(value: string): string {
	return stringify({ value }).trim().slice("value = ".length);
}

function isTomlTable(value: TomlValue | undefined): value is TomlTable {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function isStringArray(value: TomlValue): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === "string");
}
