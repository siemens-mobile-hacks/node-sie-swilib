import { vkpNormalize } from '@sie-js/vkp';

export interface SwilibPattern {
	id: number;
	name: string;
	symbol?: string;
	pattern?: string;
}

export function parsePatterns(code: string | Buffer): SwilibPattern[] {
	if (Buffer.isBuffer(code))
		code = vkpNormalize(code);

	const patterns: SwilibPattern[] = [];
	for (let line of code.split(/\n/)) {
		line = line.replace(/;.*?$/i, '').trim();

		if (!line.length || line == "[Library]" || line.startsWith('Version='))
			continue;

		let m: RegExpMatchArray | null;
		if ((m = line.match(/^([a-f0-9]+):(.*?)(?:=(.*?))?$/i))) {
			let id = parseInt(m[1], 16);
			if (patterns[id])
				throw new Error(`Function ${id.toString(16)} already exists: ${line}`);
			patterns[id] = {
				id,
				name:		m[2].trim(),
				symbol:		parsePatternsFuncName(m[2].trim()),
				pattern:	m[3] ? m[3].trim() : undefined,
			};
		} else {
			throw new Error(`Invalid line: ${line}`);
		}
	}
	return patterns;
}

function parsePatternsFuncName(comm: string) {
	let m: RegExpMatchArray | null;
	if (!comm.length) {
		return undefined;
	} else if ((m = comm.match(/^([\w_*]+)$/i))) {
		return m[1];
	} else if ((m = comm.match(/^[\w_*\s]+\s[*]?([\w_]+)\s*\(/i))) {
		return m[1];
	} else if ((m = comm.match(/^[*]?([\w_]+)\s*\(/i))) {
		return m[1];
	} else if ((m = comm.match(/^[\w_*\s]+\s[*]?([\w_]+)$/i))) {
		return m[1];
	}
	throw new Error(`Invalid function: ${comm}`);
}
