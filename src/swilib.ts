import path from 'path';
import child_process from 'node:child_process';
import { vkpRawParser, VkpParseError, vkpNormalize } from '@sie-js/vkp';
import { swilibConfig } from './config.js';
import { sprintf } from 'sprintf-js';

export enum SwiValueType {
	UNDEFINED,
	POINTER_TO_RAM,
	POINTER_TO_FLASH,
	VALUE,
}

export enum SwiType {
	EMPTY,
	FUNCTION,
	POINTER,
	VALUE,
}

export type SwiEntry = {
	id: number;
	value: number;
	symbol: string;
	type: SwiValueType;
	comment?: string;
};

export type SdkDefinition = {
	name: string
	symbol: string;
	file: string;
};

export enum SdkPointerType {
	UNKNOWN,
	RAM,
	FLASH
}

export type SdkEntry = {
	id: number;
	name: string;
	symbol: string;
	type: SwiType;
	definitions: SdkDefinition[];
	functions: SdkDefinition[];
	pointers: SdkDefinition[];
	aliases: string[];
	files: string[];
	platforms?: string[];
	builtin?: string[];
	pointerTo: SdkPointerType;
};

export type SwilibAnalysisResult = {
	errors: Record<number, string>;
	missing: number[];
	stat: {
		bad: number;
		good: number;
		missing: number;
		total: number;
		unused: number;
	};
};

export type Swilib = {
	offset: number;
	entries: SwiEntry[];
};

type SourceFile = {
	index: number;
	file: string;
};

type DoxygenEntry = {
	value:	string;
	offset:	number;
	file: string;
};

const functionPairs = getFunctionPairs();

export type SwilibParserOptions = {
	comments?: boolean;
};

export function parseSwilibPatch(code: string | Buffer, options: SwilibParserOptions = {}): Swilib {
	let offset: number | undefined;
	const entries: SwiEntry[] = [];
	let end = false;

	const validOptions = {
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

			const value = data.new.buffer.readUInt32LE(0);
			const symbol = parseSwilibFuncName(data.comment);
			if (!symbol)
				throw new VkpParseError(`Invalid comment: ${data.comment}`, loc);

			const id = data.address / 4;
			entries[id] = { id, value, symbol, type: SwiValueType.UNDEFINED };
			entries[id].type = getSwilibValueType(entries[id]);

			if (validOptions.comments) {
				entries[id].comment = data.comment;
			}
		},
		onError(e) {
			throw new Error(`${e.message}\n${e.codeFrame(code)}`);
		}
	});

	return { offset: offset ?? 0, entries };
}

export function analyzeSwilib(platform: string, sdklib: SdkEntry[], swilib: Swilib): SwilibAnalysisResult {
	const maxFunctionId = Math.max(sdklib.length, swilib.entries.length);
	const errors: Record<number, string> = {};
	const duplicates: Record<number, number> = {};
	const missing: number[] = [];
	let goodCnt = 0;
	let totalCnt = 0;
	let unusedCnt = 0;

	if (!swilibConfig.platforms.includes(platform))
		throw new Error(`Invalid platform: ${platform}`);

	for (let id = 0; id < maxFunctionId; id++) {
		const func = swilib.entries[id];
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
			const masterFunc = swilib.entries[functionPairs[id][0]];
			if (masterFunc && (!func || masterFunc.value != func.value)) {
				const expectedValue = masterFunc.value.toString(16).padStart(8, '0').toUpperCase();
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

		if (sdklib[id]?.platforms && !sdklib[id].platforms!.includes(platform) && func) {
			errors[id] = `Functions is not available on this platform.`;
			continue;
		}

		if (!isSameFunctions(sdklib[id], func)) {
			errors[id] = `Invalid function: ${func.symbol}`;
			continue;
		}

		if ((BigInt(func.value) & 0xF0000000n) == 0xA0000000n) {
			if (duplicates[func.value]) {
				const dupId = duplicates[func.value];
				if (!functionPairs[func.id] || !functionPairs[func.id].includes(dupId))
					errors[id] = `Address already used for #${formatId(dupId)} ${sdklib[dupId].symbol}.`;
			}
		}

		if (!errors[id] && func.type != SwiValueType.UNDEFINED) {
			const typeError = checkTypeConsistency(sdklib[id], func);
			if (typeError)
				errors[id] = typeError;
		}

		if (!errors[id])
			goodCnt++;
	}

	return {
		errors,
		missing,
		stat: {
			bad: Object.keys(errors).length,
			good: goodCnt,
			missing: missing.length,
			total: totalCnt,
			unused: unusedCnt
		}
	};
}

export function serializeSwilib(phone: string, sdklib: SdkEntry[], swilib: Swilib): string {
	const analysis = analyzeSwilib(getPlatformByPhone(phone), sdklib, swilib);
	const vkp = [
		`; ${phone}`,
		`${sprintf("+%08X", swilib.offset)}`,
		`#pragma enable old_equal_ff`,
	];
	for (let id = 0; id < sdklib.length; id++) {
		const func = swilib.entries[id];
		if ((id % 16) == 0)
			vkp.push('');

		const name = (sdklib[id]?.name || '').replace(/\s+/gs, ' ').trim();

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

export function getPlatformByPhone(phone: string): string {
	if (swilibConfig.platforms.includes(phone))
		return phone;
	const m = phone.match(/^(.*?)(?:v|sw)([\d+_]+)$/i);
	if (!m)
		throw new Error(`Invalid phone model: ${phone}`);
	const model = m[1];
	if (/^(EL71|E71|CL61|M72|C1F0)$/i.test(model))
		return "ELKA";
	if (/^(C81|S75|SL75|S68)$/i.test(model))
		return "NSG";
	if (/^([A-Z]+)(75|72)$/i.test(model))
		return "X75";
	return "SG";
}

export function getPlatformSwilibFromSDK(sdk: string, platform: string): SdkEntry[] {
	const SWI_FUNC_RE = /\/\*\*(.*?)\*\/|__swi_begin\s+(.*?)\s+__swi_end\(([xa-f0-9]+), ([\w_]+)\);/sig;
	const CODE_LINE_RE = /^# (\d+) "([^"]+)"/img;

	sdk = path.resolve(sdk);

	const defines: Record<string, string[]> = {
		NSG:	["-DNEWSGOLD"],
		ELKA:	["-DNEWSGOLD -DELKA"],
		X75:	["-DX75"],
		SG:		[]
	};

	const args = [
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

	const { stdout, stderr, status } = child_process.spawnSync('arm-none-eabi-gcc', args);
	if (status != 0)
		throw new Error(`GCC ERROR: ${stderr.toString()}`);

	const header = stdout.toString();

	let m: RegExpExecArray | RegExpMatchArray | null;
	const sourceFiles: SourceFile[] = [];
	while ((m = CODE_LINE_RE.exec(header))) {
		sourceFiles.push({
			index: CODE_LINE_RE.lastIndex - m[0].length,
			file: path.resolve(m[2])
		});
	}

	const getFileByIndex = (index: number) => {
		let found;
		for (const entry of sourceFiles) {
			if (index >= entry.index) {
				found = entry;
			}
		}
		return found?.file;
	};

	const table: SdkEntry[] = [];
	let prevDoxygen: DoxygenEntry | undefined;
	while ((m = SWI_FUNC_RE.exec(header))) {
		const [fullMatchStr, doxygen, name, swiNumberStr, symbol] = m;

		const offset = SWI_FUNC_RE.lastIndex - fullMatchStr.length;
		const sourceFile = getFileByIndex(offset)?.replace(`${sdk}/swilib/include/`, '');

		if (!sourceFile)
			throw new Error(`Cannot find source file for offset ${offset}.`);

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
				prevDoxygen = undefined;
			} else if (header.substring(prevDoxygen.offset, offset).match(/\S/)) {
				prevDoxygen = undefined;
			} else if (prevDoxygen.value.indexOf('@{') >= 0 || prevDoxygen.value.indexOf('@}') >= 0) {
				prevDoxygen = undefined;
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
				id: swiNumber,
				name,
				symbol,
				type: SwiType.FUNCTION,
				definitions: [],
				functions: [],
				pointers: [],
				aliases: [],
				files: [],
				platforms: undefined,
				builtin: undefined,
				pointerTo: SdkPointerType.UNKNOWN,
			};
		}

		if (prevDoxygen) {
			// Platform-dependent function
			if ((m = prevDoxygen.value.match(/@platforms\s+(.*?)$/im))) {
				table[swiNumber].platforms = table[swiNumber].platforms ?? [];
				for (const funcPlatform of m[1].trim().split(/\s*,\s*/)) {
					if (!swilibConfig.platforms.includes(funcPlatform))
						throw new Error(`Invalid platform: ${funcPlatform}`);
					if (!table[swiNumber].platforms!.includes(funcPlatform))
						table[swiNumber].platforms!.push(funcPlatform);
				}
			}
			// Builtin function
			else if ((m = prevDoxygen.value.match(/@builtin\s+(.*?)$/im))) {
				table[swiNumber].builtin = table[swiNumber].builtin ?? [];
				for (const funcPlatform of m[1].trim().split(/\s*,\s*/)) {
					if (!swilibConfig.platforms.includes(funcPlatform))
						throw new Error(`Invalid platform: ${funcPlatform}`);
					if (!table[swiNumber].builtin!.includes(funcPlatform))
						table[swiNumber].builtin!.push(funcPlatform);
				}
			}
			// Builtin function
			else if ((m = prevDoxygen.value.match(/@pointer-type\s+(.*?)$/im))) {
				const pointersTypes: Record<string, SdkPointerType> = {
					RAM: SdkPointerType.RAM,
					FLASH: SdkPointerType.FLASH,
				};
				const pointerMemoryType = m[1].trim();
				if (!(pointerMemoryType in pointersTypes))
					throw new Error(`Invalid pointer type: ${pointerMemoryType}`);
				table[swiNumber].pointerTo = pointersTypes[pointerMemoryType];
			}
		}

		if (!table[swiNumber].files.includes(sourceFile))
			table[swiNumber].files.push(sourceFile);
		table[swiNumber].aliases.push(symbol);

		table[swiNumber].definitions.push({ name, symbol, file: sourceFile });

		if (isPointer) {
			table[swiNumber].pointers.push({ name, symbol, file: sourceFile });
		} else {
			table[swiNumber].functions.push({ name, symbol, file: sourceFile });

			if (table[swiNumber].functions.length == 1) {
				table[swiNumber].symbol = table[swiNumber].functions[0].symbol;
				table[swiNumber].name = table[swiNumber].functions[0].name;
			}
		}

		prevDoxygen = undefined;
	}

	for (let id = 0; id < table.length; id++) {
		const func = table[id];
		if (!func)
			continue;

		// Analyze type
		func.type = detectSdkEntryType(table[id]);

		if (func.type == SwiType.POINTER && !func.pointerTo)
			func.pointerTo = SdkPointerType.RAM;
	}

	return table;
}

export function compareSwilibFunc(swiNumber: number, oldName: string, newName: string): boolean {
	if (newName == oldName)
		return true;
	const aliases = swilibConfig.aliases[swiNumber];
	if (aliases)
		return aliases.includes(oldName);
	return false;
}

export function getSwiBlib(swilib: Swilib): Buffer {
	const blib = Buffer.alloc(16 * 1024);
	for (let id = 0; id < 0x1000; id++) {
		const offset = id * 4;
		if (swilib.entries[id]?.value != null) {
			blib.writeUInt32LE(swilib.entries[id].value, offset);
		} else {
			blib.writeUInt32LE(0xFFFFFFFF, offset);
		}
	}
	return blib;
}

export function getSwiTypeName(type: SwiType): string {
	switch (type) {
		case SwiType.EMPTY:		return "EMPTY";
		case SwiType.FUNCTION:	return "FUNCTION";
		case SwiType.POINTER:	return "POINTER";
		case SwiType.VALUE:		return "NUMERIC_VALUE";
	}
}

export function getSwiValueTypeName(type: SwiValueType): string {
	switch (type) {
		case SwiValueType.POINTER_TO_FLASH:	return "POINTER_TO_FLASH";
		case SwiValueType.POINTER_TO_RAM:	return "POINTER_TO_RAM";
		case SwiValueType.VALUE:			return "NUMERIC_VALUE";
		case SwiValueType.UNDEFINED:		return "UNDEFINED";
	}
}

function checkTypeConsistency(sdkEntry: SdkEntry, swilibEntry: SwiEntry): string | undefined {
	const typesMap: Record<SwiType, SwiValueType[]> = {
		[SwiType.FUNCTION]:		[SwiValueType.POINTER_TO_FLASH],
		[SwiType.POINTER]:		[SwiValueType.POINTER_TO_FLASH, SwiValueType.POINTER_TO_RAM],
		[SwiType.VALUE]:		[SwiValueType.VALUE],
		[SwiType.EMPTY]:		[],
	};
	if (!typesMap[sdkEntry.type].includes(swilibEntry.type))
		return `Type mismatch: ${getSwiValueTypeName(swilibEntry.type)} (SWILIB) is not allowed for ${getSwiTypeName(sdkEntry.type)} (SDK).`;
	return undefined;
}

function parseSwilibFuncName(comm: string): string | undefined {
	comm = comm
		.replace(/^\s*0x[a-f0-9]+/i, '')
		.replace(/\/\/.*?$/i, '') // comments in comments
		.replace(/(;|\*NEW\*|\?\?\?)/gi, '')
		.replace(/Run ScreenShooter on function /g, '')
		.replace(/\((API|MP|Disp)\)/, '') // thanks dimonp25
		.replace(/С/gi, 'C') // cyrillic C
		.trim();

	let m: RegExpMatchArray | null;
	if ((m = comm.match(/^-?([a-f0-9]+)(?::?\s+|:)([\w_ *-]*\s*[*\s]+)?([\w_]+)\s*\(/i))) {
		return m[3];
	} else if ((m = comm.match(/^-?([a-f0-9]+)(?::?\s+|:)([\w_ *-]*\s*[*\s]+)?([\w_]+)$/i))) {
		return m[3];
	} else if ((m = comm.match(/^([a-f0-9]+):$/i))) {
		return `FUNC_${m[1]}`;
	}

	return undefined;
}

function detectSdkEntryType(entry: SdkEntry): SwiType {
	if (!entry.functions.length) {
		if (entry.name.match(/^[\w\s]+\s(\w+)\s*\(\s*(void)?\s*\)/i)) {
			return SwiType.VALUE;
		} else {
			return SwiType.POINTER;
		}
	}
	return SwiType.FUNCTION;
}

function getSwilibValueType(entry: SwiEntry): SwiValueType {
	if (entry != null && entry.value != 0xFFFFFFFF) {
		const addr = BigInt(entry.value) & 0xFF000000n;
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

function formatId(id: number): string {
	return id.toString(16).padStart(3, "0").toUpperCase();
}

function isSameFunctions(targetFunc: SdkEntry, checkFunc: SwiEntry) {
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

function getFunctionPairs(): Record<number, number[]> {
	const functionPairs: Record<number, number[]> = {};
	for (const p of swilibConfig.pairs) {
		for (let i = 0; i < p.length; i++)
			functionPairs[p[i]] = p;
	}
	return functionPairs;
}

function isStrInArray(arr: string[] | undefined, search: string) {
	if (arr) {
		search = search.toLowerCase();
		for (const word of arr) {
			if (word.toLowerCase() === search)
				return true;
		}
	}
	return false;
}
