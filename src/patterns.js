import { vkpNormalize } from '@sie-js/vkp';

export function parsePatterns(code) {
	if (Buffer.isBuffer(code))
		code = vkpNormalize(code);

	let patterns = [];
	for (let line of code.split(/\n/)) {
		line = line.replace(/;.*?$/i, '').trim();

		if (!line.length || line == "[Library]" || line.startsWith('Version='))
			continue;

		let m;
		if ((m = line.match(/^([a-f0-9]+):(.*?)(?:=(.*?))?$/i))) {
			let id = parseInt(m[1], 16);
			if (patterns[id])
				throw new Error(`Function ${id.toString(16)} already exists: ${line}`);
			patterns[id] = {
				id,
				name:		m[2].trim(),
				symbol:		parsePatternsFuncName(m[2].trim()),
				pattern:	m[3] ? m[3].trim() : null,
			};
		} else {
			throw new Error(`Invalid line: ${line}`);
		}
	}
	return patterns;
}

export function serializePatterns(patterns) {
	let lines = [`[Library]`];
	for (let id in patterns) {
		if (id && (id % 16) == 0) {
			lines.push("");
		}

		id = +id;
		let ptr = patterns[id];
		if (!ptr) {
			lines.push(`${id.toString(16).padStart(2, '0').toUpperCase()}:`);
		} else if (ptr.pattern) {
			lines.push(`${id.toString(16).padStart(2, '0').toUpperCase()}:${ptr.name.replace(/\s+/gs, ' ')} = ${ptr.pattern}`);
		} else {
			if (isELFLoaderFunction(id)) {
				lines.push(`${id.toString(16).padStart(2, '0').toUpperCase()}:${ptr.name.replace(/\s+/gs, ' ')} ; ELFLoader`);
			} else {
				lines.push(`${id.toString(16).padStart(2, '0').toUpperCase()}:${ptr.name.replace(/\s+/gs, ' ')}`);
			}
		}
	}
	lines.push("");
	return lines.join("\n");
}

function parsePatternsFuncName(comm) {
	let m;
	if (!comm.length) {
		return null;
	} else if ((m = comm.match(/^([\w\d_*]+)$/i))) {
		return m[1];
	} else if ((m = comm.match(/^[\w\d_*\s]+\s[*]?([\w\d_]+)\s*\(/i))) {
		return m[1];
	} else if ((m = comm.match(/^[*]?([\w\d_]+)\s*\(/i))) {
		return m[1];
	} else if ((m = comm.match(/^[\w\d_*\s]+\s[*]?([\w\d_]+)$/i))) {
		return m[1];
	}
	throw new Error(`Invalid function: ${comm}`);
}
