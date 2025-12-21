import { SwiType } from "#src/swilib/parse.js";
import { isValidSwilibPlatform, SwiPlatform } from "#src/config.js";
import path from "path";
import promiseSpawn from "@npmcli/promise-spawn";

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
	platforms?: SwiPlatform[];
	builtin?: string[];
	pointerTo: SdkPointerType;
};

export type Sdklib = {
	entries: SdkEntry[];
	platform: SwiPlatform;
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

export async function parseLibraryFromSDK(sdkPath: string, platform: SwiPlatform): Promise<Sdklib> {
	const SWI_FUNC_RE = /\/\*\*(.*?)\*\/|__swi_begin\s+(.*?)\s+__swi_end\(([xa-f0-9]+), ([\w_]+)\);/sig;
	const CODE_LINE_RE = /^# (\d+) "([^"]+)"/img;

	const defines: Record<SwiPlatform, string[]> = {
		NSG:	["-DNEWSGOLD"],
		ELKA:	["-DNEWSGOLD", "-DELKA"],
		X75:	["-DX75"],
		SG:		[]
	};

	if (!defines[platform])
		throw new Error(`Invalid platform: ${platform}`);

	const args = [
		"-E",
		"-CC",
		"-nostdinc",
		`-I${sdkPath}/dietlibc/include`,
		`-I${sdkPath}/swilib/include`,
		`-I${sdkPath}/include`,
		"-DDOXYGEN",
		"-DSWILIB_PARSE_FUNCTIONS",
		"-DSWILIB_INCLUDE_ALL",
		...defines[platform],
		`${sdkPath}/swilib/include/swilib.h`,
	];

	const { stdout, stderr, code } = await promiseSpawn('arm-none-eabi-gcc', args);
	if (code != 0)
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

	const entries: SdkEntry[] = [];
	let prevDoxygen: DoxygenEntry | undefined;
	while ((m = SWI_FUNC_RE.exec(header))) {
		const [fullMatchStr, doxygen, name, swiNumberStr, symbol] = m;

		const offset = SWI_FUNC_RE.lastIndex - fullMatchStr.length;
		const sourceFile = getFileByIndex(offset)?.replace(`${sdkPath}/swilib/include/`, '');

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

		if (!entries[swiNumber]) {
			entries[swiNumber] = {
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
				entries[swiNumber].platforms = entries[swiNumber].platforms ?? [];
				for (const funcPlatform of m[1].trim().split(/\s*,\s*/) as SwiPlatform[]) {
					if (!isValidSwilibPlatform(funcPlatform))
						throw new Error(`Invalid platform: ${funcPlatform}`);
					if (!entries[swiNumber].platforms!.includes(funcPlatform))
						entries[swiNumber].platforms!.push(funcPlatform);
				}
			}
			// Builtin function
			else if ((m = prevDoxygen.value.match(/@builtin\s+(.*?)$/im))) {
				entries[swiNumber].builtin = entries[swiNumber].builtin ?? [];
				for (const funcPlatform of m[1].trim().split(/\s*,\s*/) as SwiPlatform[]) {
					if (!isValidSwilibPlatform(funcPlatform))
						throw new Error(`Invalid platform: ${funcPlatform}`);
					if (!entries[swiNumber].builtin!.includes(funcPlatform))
						entries[swiNumber].builtin!.push(funcPlatform);
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
				entries[swiNumber].pointerTo = pointersTypes[pointerMemoryType];
			}
		}

		if (!entries[swiNumber].files.includes(sourceFile))
			entries[swiNumber].files.push(sourceFile);
		entries[swiNumber].aliases.push(symbol);

		entries[swiNumber].definitions.push({ name, symbol, file: sourceFile });

		if (isPointer) {
			entries[swiNumber].pointers.push({ name, symbol, file: sourceFile });
		} else {
			entries[swiNumber].functions.push({ name, symbol, file: sourceFile });

			if (entries[swiNumber].functions.length == 1) {
				entries[swiNumber].symbol = entries[swiNumber].functions[0].symbol;
				entries[swiNumber].name = entries[swiNumber].functions[0].name;
			}
		}

		prevDoxygen = undefined;
	}

	for (let id = 0; id < entries.length; id++) {
		const func = entries[id];
		if (!func)
			continue;

		// Analyze type
		func.type = detectSdkEntryType(entries[id]);

		if (func.type == SwiType.POINTER && !func.pointerTo)
			func.pointerTo = SdkPointerType.RAM;
	}

	return {
		entries,
		platform
	};
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
