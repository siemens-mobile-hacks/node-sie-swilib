import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { vkpRawParser, VkpParseError, vkpNormalize } from '@sie-js/vkp';
import SWILIB_CONFIG from './config.js';

export function getSwilibConfig() {
	return SWILIB_CONFIG;
}

export function isELFLoaderFunction(swiNumber) {
	return SWILIB_CONFIG.builtin.includes(swiNumber);
}

export function parseSwilibPatch(code) {
	let offset = null;
	let entries = [];
	let end = false;

	if (Buffer.isBuffer(code))
		code = vkpNormalize(code);

	vkpRawParser(code, {
		onOffset(value, loc) {
			if (value.offset == 0) {
				end = true;
				return;
			}
			if (offset != null)
				throw new VkpParseError(`Duplicated offset`, loc);
			offset = value.offset;
		},
		onPatchData(data, loc) {
			if (end)
				throw new VkpParseError(`Entry after end`, loc);
			if (!offset)
				throw new VkpParseError(`Entry without offset`, loc);
			if (data.new.buffer.length != 4)
				throw new VkpParseError(`Value length is not equal 4`, loc);
			if ((data.address % 4) != 0)
				throw new VkpParseError(`Address is not aligned to 4`, loc);

			let value = data.new.buffer.readUInt32LE(0);
			let symbol = parseSwilibFuncName(data.comment);
			if (!symbol)
				throw new VkpParseError(`Invalid comment: ${data.comment}`, loc);

			let id = data.address / 4;
			entries[id] = { id, value, symbol };
		},
		onError(e) {
			throw new Error(`${e.message}\n${e.codeFrame(code)}`);
		}
	});

	return { offset, entries };
}

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

export function getSwilibFromPatterns(filePath) {
	let id2name = {};
	let patterns = parsePatterns(fs.readFileSync(filePath));
	for (let pattern of patterns) {
		if (!pattern)
			continue;
		id2name[pattern.id] = pattern.symbol;
	}
	return id2name;
}

export function getSwilibFromSDK(sdk) {
	let id2name = {};
	for (let platform of ["ELKA", "NSG", "X75", "SG"]) {
		let platformFunctions = getPlatformSwilibFromSDK(sdk, platform);
		for (let swiNumber in platformFunctions) {
			let f = platformFunctions[swiNumber];
			id2name[swiNumber] = f.name;
		}
	}
	return id2name;
}

export function getPlatformByPhone(phone) {
	let m = phone.match(/^(.*?)(?:v|sw)([\d+_]+)$/i);
	let model = m[1];
	if (/^(EL71|E71|CL61|M72|C1F0)$/i.test(model))
		return "ELKA";
	if (/^(C81|S75|SL75|S68)$/i.test(model))
		return "NSG";
	if (/^([A-Z]+)(75|72)$/i.test(model))
		return "X75";
	return "SG";
}

export function getPlatformSwilibFromSDK(sdk, platform) {
	const SWI_FUNC_RE = /__swi_begin\s+(.*?)\s+__swi_end\(([xa-f0-9]+), ([\w\d_]+)\);/sig;
	const CODE_LINE_RE = /^# (\d+) "([^"]+)"$/img;

	sdk = path.resolve(sdk);

	let defines = {
		NSG:	["-DNEWSGOLD"],
		ELKA:	["-DNEWSGOLD -DELKA"],
		X75:	["-DX75"],
		SG:		[]
	};

	let args = [
		"-E",
		"-nostdinc",
		`-I${sdk}/dietlibc/include`,
		`-I${sdk}/swilib/include`,
		`-I${sdk}/include`,
		"-DDOXYGEN",
		"-DSWILIB_PARSE_FUNCTIONS",
		"-DSWILIB_INCLUDE_ALL",
		...defines[platform],
		`${sdk}/swilib/include/swilib.h`,
	];

	let { stdout, stderr, status } = child_process.spawnSync('arm-none-eabi-gcc', args);
	if (status != 0)
		throw new Error(`GCC ERROR: ${stderr.toString()}`);

	let m;
	let sourceFiles = [];
	while ((m = CODE_LINE_RE.exec(stdout))) {
		sourceFiles.unshift({
			index: CODE_LINE_RE.lastIndex,
			file: path.resolve(m[2])
		});
	}

	let getFileByIndex = (index) => {
		for (let entry of sourceFiles) {
			if (index >= entry.index)
				return entry.file;
		}
		return null;
	};

	let table = [];
	while ((m = SWI_FUNC_RE.exec(stdout))) {
		let swiNumber = parseInt(m[2], 16);
		let isPointer = false;

		if (swiNumber >= 0x8000) {
			isPointer = true;
			swiNumber = swiNumber - 0x8000;
		} else if (swiNumber >= 0x4000) {
			swiNumber = swiNumber - 0x4000;
		}

		if (!table[swiNumber]) {
			table[swiNumber] = {
				id:			swiNumber,
				name:		m[1],
				symbol:		m[3],
				functions:	[],
				pointers:	[],
				aliases:	[],
				files:		[]
			};
		}

		let sourceFile = getFileByIndex(SWI_FUNC_RE.lastIndex).replace(`${sdk}/swilib/include/`, '');

		if (!table[swiNumber].files.includes(sourceFile))
			table[swiNumber].files.push(sourceFile);
		table[swiNumber].aliases.push(m[3]);

		if (isPointer) {
			table[swiNumber].pointers.push({
				symbol:		m[3],
				name:		m[1],
			});
		} else {
			table[swiNumber].functions.push({
				symbol:		m[3],
				name:		m[1],
			});

			if (table[swiNumber].functions.length == 1) {
				table[swiNumber].symbol = table[swiNumber].functions[0].symbol;
				table[swiNumber].name = table[swiNumber].functions[0].name;
			}
		}
	}

	return table;
}

export function compareSwilibFunc(swiNumber, oldName, newName) {
	if (newName == oldName)
		return true;
	let aliases = swiNumber[+swiNumber];
	if (aliases)
		return aliases.includes(oldName);
	return false;
}

function parseSwilibFuncName(comm) {
	comm = comm
	.replace(/^\s*0x[a-f0-9]+/i, '')
	.replace(/\/\/.*?$/i, '')
	.replace(/(;|\*NEW\*|\?\?\?)/gi, '')
	.replace(/Run ScreenShooter on function /g, '')
	.replace(/С/gi, 'C')
	.trim();

	let m;
	if ((m = comm.match(/^-?([a-f0-9]+)(?::?\s+|:)(?:([\w\d_ *-]*\s*[*\s]+))?([\w\d_]+)\s*\(/i))) {
		return m[3];
	} else if ((m = comm.match(/^-?([a-f0-9]+)(?::?\s+|:)(?:([\w\d_ *-]*\s*[*\s]+))?([\w\d_]+)$/i))) {
		return m[3];
	} else if ((m = comm.match(/^([a-f0-9]+):$/i))) {
		return `FUNC_${m[1]}`;
	}

	return false;
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
