import toml, { TomlTable, TomlValue } from 'smol-toml';

export interface SwilibPattern {
	id: number;
	name: string;
	symbol?: string;
	pattern?: string | string[];
}

export function parsePatterns(code: string | Buffer, platform: string): Array<SwilibPattern | undefined> {
	if (!platform)
		throw new Error('Platform is required when parsing patterns.toml.');

	const document = toml.parse(Buffer.isBuffer(code) ? code.toString() : code);
	const groups = document["platforms"];
	if (!isTomlTable(groups))
		throw new Error('patterns.toml has no platforms table.');

	const platformGroups = Object.entries(groups).map(([scope, members]) => {
		if (!isStringArray(members))
			throw new Error(`Pattern platform group ${scope} must be an array of strings.`);
		return [scope, members] as const;
	});
	if (!platformGroups.some(([, members]) => members.includes(platform)))
		throw new Error(`Unknown patterns platform: ${platform}`);

	const scopes = platformGroups
		.filter(([, members]) => members.includes(platform))
		.sort((left, right) => right[1].length - left[1].length)
		.map(([scope]) => scope)
		.concat(platform);
	const patterns: Array<SwilibPattern | undefined> = [];

	for (const [idText, value] of Object.entries(document)) {
		if (idText === "platforms")
			continue;
		if (!/^[0-9a-f]+$/i.test(idText))
			throw new Error(`Invalid pattern id: ${idText}`);
		if (!isTomlTable(value))
			throw new Error(`Pattern ${idText} must be a TOML table.`);

		const id = parseInt(idText, 16);
		if (patterns[id])
			throw new Error(`Function ${idText} already exists.`);

		const pattern = lastValue(value, scopes);
		if (pattern === undefined || pattern === false)
			continue;
		if (typeof pattern !== "string" && !isStringArray(pattern))
			throw new Error(`Pattern ${idText} must be a string, an array of strings, or false.`);

		const declarationScopes = ["decl", ...scopes
			.filter(scope => scope !== "ALL")
			.map(scope => `decl_${scope}`)];
		const name = lastValue(value, declarationScopes);
		if (typeof name !== "string")
			throw new Error(`Pattern ${idText} has no string declaration.`);

		const normalizedName = name.trim();
		patterns[id] = {
			id,
			name: normalizedName,
			symbol: parsePatternsFuncName(normalizedName),
			pattern: normalizePattern(pattern),
		};
	}

	return patterns;
}

function lastValue(table: TomlTable, keys: string[]): TomlValue | undefined {
	let value: TomlValue | undefined;
	for (const key of keys)
		value = table[key] ?? value;
	return value;
}

function isTomlTable(value: TomlValue | undefined): value is TomlTable {
	return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function isStringArray(value: TomlValue): value is string[] {
	return Array.isArray(value) && value.every(item => typeof item === "string");
}

function normalizePattern(pattern: string | string[]): string | string[] | undefined {
	if (typeof pattern === "string")
		return normalizePatternString(pattern) || undefined;
	return pattern.map(normalizePatternString);
}

function normalizePatternString(pattern: string): string {
	return pattern.trim().replace(/\r?\n[ \t]*/g, '');
}

function parsePatternsFuncName(declaration: string): string | undefined {
	if (!declaration.length)
		return undefined;

	const functionPointer = declaration.match(/\(\s*\*+\s*([A-Za-z_]\w*)\s*\)/);
	if (functionPointer)
		return functionPointer[1];

	const argumentsStart = declaration.indexOf('(');
	const prefix = argumentsStart === -1 ? declaration : declaration.slice(0, argumentsStart);
	const symbol = prefix.match(/([A-Za-z_]\w*)\s*$/);
	if (symbol)
		return symbol[1];

	throw new Error(`Invalid function: ${declaration}`);
}
