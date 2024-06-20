import path from 'path';
import child_process from 'child_process';
import { vkpRawParser, VkpParseError, vkpNormalize } from '@sie-js/vkp';
import swilibConfig from './config.js';
import { sprintf } from 'sprintf-js';

export { swilibConfig };

export const SwiValueType = {
	UNDEFINED:			0,
	POINTER_TO_RAM:		1,
	POINTER_TO_FLASH:	2,
	VALUE:				3,
};

export const SwiType = {
	EMPTY:		0,
	FUNCTION:	1,
	POINTER:	2,
	VALUE:		3,
};

const functionPairs = getFunctionPairs();

export function parseSwilibPatch(code, options = {}) {
	let offset = null;
	let entries = [];
	let end = false;

	options = {
		comments: false,
		...options,
	};

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
			entries[id].type = getSwilibValueType(entries[id]);

			if (options.comments) {
				entries[id].comment = data.comment;
			}
		},
		onError(e) {
			throw new Error(`${e.message}\n${e.codeFrame(code)}`);
		}
	});

	return { offset, entries };
}

export function analyzeSwilib(platform, sdklib, swilib) {
	let maxFunctionId = Math.max(sdklib.length, swilib.entries.length);
	let errors = {};
	let duplicates = {};
	let missing = [];
	let goodCnt = 0;
	let totalCnt = 0;
	let unusedCnt = 0;

	if (!swilibConfig.platforms.includes(platform))
		throw new Error(`Invalid platform: ${platform}`);

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
			if (!sdklib[id].builtin)
				missing.push(id);
			continue;
		}

		if (sdklib[id]?.builtin?.includes(platform) && func) {
			errors[id] = `Invalid function: ${func.symbol} (Reserved by ELFLoader)`;
			continue;
		}

		if (sdklib[id]?.platforms && !sdklib[id].platforms.includes(platform) && func) {
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

		if (!errors[id] && func.type != SwiValueType.UNDEFINED) {
			let typeError = checkTypeConsistency(sdklib[id], func);
			if (typeError)
				errors[id] = typeError;
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
	let analysis = analyzeSwilib(getPlatformByPhone(phone), sdklib, swilib);
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
				vkp.push(sprintf(";%03X: 0x%08X   ; %3X: %s", id * 4, func.value, id, name));
			} else {
				vkp.push(sprintf(";%03X:              ; %3X: %s", id * 4, id, name));
			}
			vkp.push('');
		} else if (sdklib[id]) {
			if (func?.comment != null) {
				if (func?.value != null) {
					vkp.push(sprintf("%04X: 0x%08X   ;%s", id * 4, func.value, func.comment));
				} else {
					vkp.push(sprintf(";%03X:              ;%s", id * 4, id, func.comment));
				}
			} else {
				if (func?.value != null) {
					vkp.push(sprintf("%04X: 0x%08X   ; %3X: %s", id * 4, func.value, id, name));
				} else {
					vkp.push(sprintf(";%03X:              ; %3X: %s", id * 4, id, name));
				}
			}
		} else {
			vkp.push(sprintf(";%03X:              ; %3X:", id * 4, id));
		}
	}
	vkp.push('');
	vkp.push(`#pragma enable old_equal_ff`);
	vkp.push(`+0`);
	return vkp.join('\r\n');
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
	const SWI_FUNC_RE = /\/\*\*(.*?)\*\/|__swi_begin\s+(.*?)\s+__swi_end\(([xa-f0-9]+), ([\w\d_]+)\);/sig;
	const CODE_LINE_RE = /^# (\d+) "([^"]+)"/img;

	sdk = path.resolve(sdk);

	let defines = {
		NSG:	["-DNEWSGOLD"],
		ELKA:	["-DNEWSGOLD -DELKA"],
		X75:	["-DX75"],
		SG:		[]
	};

	let args = [
		"-E",
		"-CC",
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

	stdout = stdout.toString();

	let m;
	let sourceFiles = [];
	while ((m = CODE_LINE_RE.exec(stdout))) {
		sourceFiles.push({
			index: CODE_LINE_RE.lastIndex - m[0].length,
			file: path.resolve(m[2])
		});
	}

	let getFileByIndex = (index) => {
		let found;
		for (let entry of sourceFiles) {
			if (index >= entry.index) {
				found = entry;
			}
		}
		return found?.file;
	};

	let table = [];
	let prevDoxygen;
	while ((m = SWI_FUNC_RE.exec(stdout))) {
		let [fullMatchStr, doxygen, name, swiNumberStr, symbol] = m;

		let offset = SWI_FUNC_RE.lastIndex - fullMatchStr.length;
		let sourceFile = getFileByIndex(offset).replace(`${sdk}/swilib/include/`, '');

		if (doxygen) {
			prevDoxygen = {
				value:	doxygen,
				offset:	SWI_FUNC_RE.lastIndex,
				file:	sourceFile
			};
			continue;
		}

		if (prevDoxygen) {
			if (prevDoxygen.file != sourceFile) {
				prevDoxygen = null;
			} else if (stdout.substring(prevDoxygen.offset, offset).match(/\S/)) {
				prevDoxygen = null;
			} else if (prevDoxygen.value.indexOf('@{') >= 0 || prevDoxygen.value.indexOf('@}') >= 0) {
				prevDoxygen = null;
			}
		}

		let swiNumber = parseInt(swiNumberStr, 16);
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
				name,
				symbol,
				type:		SwiType.FUNCTION,
				functions:	[],
				pointers:	[],
				aliases:	[],
				files:		[],
				platforms:	null,
				builtin:	null,
				pointerTo:	null,
			};
		}

		if (prevDoxygen) {
			// Platform-dependent function
			if ((m = prevDoxygen.value.match(/@platforms\s+(.*?)$/im))) {
				table[swiNumber].platforms = table[swiNumber].platforms || [];
				for (let funcPlatform of m[1].trim().split(/\s*,\s*/)) {
					if (!swilibConfig.platforms.includes(funcPlatform))
						throw new Error(`Invalid platform: ${funcPlatform}`);
					if (!table[swiNumber].platforms.includes(funcPlatform))
						table[swiNumber].platforms.push(funcPlatform);
				}
			}
			// Builtin function
			else if ((m = prevDoxygen.value.match(/@builtin\s+(.*?)$/im))) {
				table[swiNumber].builtin = table[swiNumber].builtin || [];
				for (let funcPlatform of m[1].trim().split(/\s*,\s*/)) {
					if (!swilibConfig.platforms.includes(funcPlatform))
						throw new Error(`Invalid platform: ${funcPlatform}`);
					if (!table[swiNumber].builtin.includes(funcPlatform))
						table[swiNumber].builtin.push(funcPlatform);
				}
			}
			// Builtin function
			else if ((m = prevDoxygen.value.match(/@pointer-type\s+(.*?)$/im))) {
				let pointerMemoryType = m[1].trim();
				if (!["RAM", "FLASH"].includes(pointerMemoryType))
					throw new Error(`Invalid pointer type: ${pointerMemoryType}`);
				table[swiNumber].pointerTo = pointerMemoryType;
			}
		}

		if (!table[swiNumber].files.includes(sourceFile))
			table[swiNumber].files.push(sourceFile);
		table[swiNumber].aliases.push(symbol);

		if (isPointer) {
			table[swiNumber].pointers.push({ name, symbol });
		} else {
			table[swiNumber].functions.push({ name, symbol });

			if (table[swiNumber].functions.length == 1) {
				table[swiNumber].symbol = table[swiNumber].functions[0].symbol;
				table[swiNumber].name = table[swiNumber].functions[0].name;
			}
		}

		prevDoxygen = null;
	}

	for (let id = 0; id < table.length; id++) {
		let func = table[id];
		if (!func)
			continue;

		// Analyze type
		func.type = detectSdkEntryType(table[id]);

		if (func.type == SwiType.POINTER && !func.pointerTo)
			func.pointerTo = 'RAM';
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

export function getSwiTypeName(type) {
	switch (type) {
		case SwiType.EMPTY:		return "EMPTY";
		case SwiType.FUNCTION:	return "FUNCTION";
		case SwiType.POINTER:	return "POINTER";
		case SwiType.VALUE:		return "NUMERIC_VALUE";
	}
	return "???";
}

export function getSwiValueTypeName(type) {
	switch (type) {
		case SwiValueType.POINTER_TO_FLASH:	return "POINTER_TO_FLASH";
		case SwiValueType.POINTER_TO_RAM:	return "POINTER_TO_RAM";
		case SwiValueType.VALUE:			return "NUMERIC_VALUE";
		case SwiValueType.UNDEFINED:		return "UNDEFINED";
	}
	return "???";
}

function checkTypeConsistency(sdkEntry, swilibEntry) {
	let typesMap = {
		[SwiType.FUNCTION]:		[SwiValueType.POINTER_TO_FLASH],
		[SwiType.POINTER]:		[SwiValueType.POINTER_TO_FLASH, SwiValueType.POINTER_TO_RAM],
		[SwiType.VALUE]:		[SwiValueType.VALUE],
	};
	if (!typesMap[sdkEntry.type].includes(swilibEntry.type))
		return `Type mismatch: ${getSwiValueTypeName(swilibEntry.type)} (SWILIB) is not allowed for ${getSwiTypeName(sdkEntry.type)} (SDK).`;
	return null;
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

function detectSdkEntryType(entry) {
	if (!entry.functions.length) {
		if (entry.name.match(/^[\w\d\s]+\s([\w\d]+)\s*\(\s*(void)?\s*\)/i)) {
			return SwiType.VALUE;
		} else {
			return SwiType.POINTER;
		}
	}
	return SwiType.FUNCTION;
}

function getSwilibValueType(entry) {
	if (entry != null && entry.value != 0xFFFFFFFF) {
		let addr = BigInt(entry.value) & 0xFF000000n;
		if (addr >= 0xA0000000n && addr < 0xA8000000n) {
			return SwiValueType.POINTER_TO_FLASH;
		} else if (addr >= 0xA8000000n && addr < 0xB0000000n) {
			return SwiValueType.POINTER_TO_RAM;
		} else {
			return SwiValueType.VALUE;
		}
	}
	return SwiValueType.UNDEFINED;
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
