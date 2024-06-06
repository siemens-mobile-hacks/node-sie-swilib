import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { vkpRawParser, VkpParseError, vkpNormalize } from '@sie-js/vkp';
import swilibConfig from './config.js';

export { swilibConfig };

export const SwiType = {
	EMPTY:		0,
	FUNCTION:	1,
	POINTER:	2,
	VALUE:		3,
};

const functionPairs = getFunctionPairs();

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
			entries[id].type = detectSwilibEntryType(entries[id]);
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

		// Analyze type
		table[swiNumber].type = detectSdkEntryType(table[swiNumber]);
	}

	return table;
}

export function analyzeSwilib(platform, sdklib, swilib) {
	let maxFunctionId = Math.max(sdklib.length, swilib.entries.length);
	let errors = {};
	let duplicates = {};
	let missing = [];
	let goodCnt = 0;
	let totalCnt = 0;
	let unusedCnt = 0;

	for (let id = 0; id < maxFunctionId; id++) {
		let func = swilib.entries[id];
		if (!sdklib[id] && !func) {
			unusedCnt++;
			continue;
		}

		totalCnt++;

		if (!sdklib[id] && func) {
			errors[id] = `Unknown function: ${func.symbol}`;
			continue;
		}

		if (functionPairs[id]) {
			let masterFunc = swilib.entries[functionPairs[id][0]];
			if (masterFunc && (!func || masterFunc.value != func.value)) {
				let expectedValue = masterFunc.value.toString(16).padStart(8, '0').toUpperCase();
				errors[id] = `Address must be equal with #${formatId(masterFunc.id)} ${masterFunc.symbol} (0x${expectedValue}).`;
			}
		}

		if (sdklib[id] && !func) {
			if (!(id in swilibConfig.builtin))
				missing.push(id);
			continue;
		}

		if (swilibConfig.builtin[id]?.includes(platform) && func) {
			errors[id] = `Reserved by ELFLoader (${sdklib[id].symbol}).`;
			continue;
		}

		if (swilibConfig.platformDependentFunctions[id]?.includes(platform) && func) {
			errors[id] = `Functions is not available on this platform.`;
			continue;
		}

		if (!isSameFunctions(sdklib[id], func)) {
			errors[id] = `Invalid function: ${func.symbol}`;
			continue;
		}

		if ((BigInt(func.value) & 0xF0000000n) == 0xA0000000n) {
			if (duplicates[func.value]) {
				let dupId = duplicates[func.value];
				if (!functionPairs[func.id] || !functionPairs[func.id].includes(dupId))
					errors[id] = `Address already used for #${formatId(dupId)} ${sdklib[dupId].symbol}.`;
			}
		}

		if (!errors[id] && func.type != sdklib[id].type && func.type != SwiType.EMPTY) {
			errors[id] = `Type mismatch: swilib entry is ${getSwiTypeName(func.type)}, but expected ${getSwiTypeName(sdklib[id].type)} (SDK)`;
		}

		if (!errors[id])
			goodCnt++;
	}

	let stat = {
		bad: Object.keys(errors).length,
		good: goodCnt,
		missing: missing.length,
		total: totalCnt,
		unused: unusedCnt
	};
	return { errors, missing, stat };
}

export function serializeSwilib(phone, sdklib, swilib) {
	let analysis = analyzeSwilib(phone, sdklib, swilib);
	let vkp = [
		`; ${phone}`,
		`${sprintf("+%08X", swilib.offset)}`,
		`#pragma enable old_equal_ff`,
	];
	for (let id = 0; id < sdklib.length; id++) {
		let func = swilib.entries[id];
		if ((id % 16) == 0)
			vkp.push('');

		let name = (sdklib[id]?.name || '').replace(/\s+/gs, ' ').trim();

		if (analysis.errors[id]) {
			vkp.push('');
			vkp.push(`; [ERROR] ${analysis.errors[id]}`);
			if (func?.value != null) {
				vkp.push(sprintf(";%03X: 0x%08X   ; %03X: %s", id * 4, func.value, id, name));
			} else {
				vkp.push(sprintf(";%03X:              ; %03X: %s", id * 4, id, name));
			}
			vkp.push('');
		} else if (sdklib[id]) {
			if (func?.value != null) {
				vkp.push(sprintf("%04X: 0x%08X   ; %03X: %s", id * 4, func.value, id, name));
			} else {
				vkp.push(sprintf(";%03X:              ; %03X: %s", id * 4, id, name));
			}
		} else {
			vkp.push(sprintf(";%03X:              ; %03X:", id * 4, id));
		}
	}
	vkp.push('');
	vkp.push(`#pragma enable old_equal_ff`);
	vkp.push(`+0`);
	return vkp.join('\r\n');
}

export function compareSwilibFunc(swiNumber, oldName, newName) {
	if (newName == oldName)
		return true;
	let aliases = swiNumber[+swiNumber];
	if (aliases)
		return aliases.includes(oldName);
	return false;
}

export function getSwiBlib(swilib) {
	let blib = Buffer.alloc(16 * 1024);
	for (let id = 0; id < 0x1000; id++) {
		let offset = id * 4;
		if (swilib.entries[id]?.value != null) {
			blib.writeUInt32LE(swilib.entries[id].value, offset);
		} else {
			blib.writeUInt32LE(0xFFFFFFFF, offset);
		}
	}
	return blib;
}

function detectSdkEntryType(entry) {
	if (swilibConfig.forcePointers.includes(entry.id))
		return SwiType.POINTER;
	if (!entry.functions.length) {
		if (entry.name.match(/^[\w\d\s]+\s([\w\d]+)\s*\(\s*(void)?\s*\)/i)) {
			return SwiType.VALUE;
		} else {
			return SwiType.POINTER;
		}
	}
	return SwiType.FUNCTION;
}

function detectSwilibEntryType(entry) {
	if (entry != null && entry.value != 0xFFFFFFFF) {
		let addr = BigInt(entry.value) & 0xFF000000n;
		if (addr >= 0xA0000000n && addr < 0xA8000000n) {
			if (swilibConfig.forcePointers.includes(entry.id))
				return SwiType.POINTER;
			return SwiType.FUNCTION;
		} else if (addr >= 0xA8000000n && addr < 0xB0000000n) {
			return SwiType.POINTER;
		} else {
			return SwiType.VALUE;
		}
	}
	return SwiType.EMPTY;
}

export function getSwiTypeName(type) {
	switch (type) {
		case SwiType.EMPTY:		return "EMPTY";
		case SwiType.FUNCTION:	return "FIRMWARE_FUNCTION";
		case SwiType.POINTER:	return "RAM_POINTER";
		case SwiType.VALUE:		return "NUMERIC_VALUE";
	}
	return "???";
}

function parseSwilibFuncName(comm) {
	comm = comm
		.replace(/^\s*0x[a-f0-9]+/i, '')
		.replace(/\/\/.*?$/i, '') // comments in comments
		.replace(/(;|\*NEW\*|\?\?\?)/gi, '')
		.replace(/Run ScreenShooter on function /g, '')
		.replace(/\((API|MP|Disp)\)/, '') // thanks dimonp25
		.replace(/С/gi, 'C') // cyrillic C
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

function formatId(id) {
	return (+id).toString(16).padStart(3, 0).toUpperCase();
}

function isSameFunctions(targetFunc, checkFunc) {
	if (!targetFunc && !checkFunc)
		return true;
	if (!targetFunc || !checkFunc)
		return false;
	if (targetFunc.id != checkFunc.id)
		return false;
	if (targetFunc.symbol == checkFunc.symbol)
		return true;
	if (isStrInArray(targetFunc.aliases, checkFunc.symbol))
		return true;
	if (isStrInArray(swilibConfig.aliases[+targetFunc.id], checkFunc.symbol))
		return true;
	return false;
}

function getFunctionPairs() {
	let functionPairs = {};
	for (let p of swilibConfig.pairs) {
		for (let i = 0; i < p.length; i++)
			functionPairs[p[i]] = p;
	}
	return functionPairs;
}

function isStrInArray(arr, search) {
	if (arr) {
		search = search.toLowerCase();
		for (let word of arr) {
			if (word.toLowerCase() === search)
				return true;
		}
	}
	return false;
}
