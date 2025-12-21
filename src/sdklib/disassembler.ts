import { sprintf } from 'sprintf-js';
import { analyzeSwilib } from "#src/swilib/analyze.js";
import { Swilib, SwiType } from "#src/swilib/parse.js";
import { SwilibConfig, SwiPlatform } from "#src/config.js";
import { Sdklib } from "#src/sdklib/parse.js";
import promiseSpawn from "@npmcli/promise-spawn";

export async function getDataTypesHeader(sdkPath: string, platform: SwiPlatform): Promise<string> {
	const defines: Record<SwiPlatform, string[]> = {
		NSG:  ["-DNEWSGOLD"],
		ELKA: ["-DNEWSGOLD -DELKA"],
		X75:  ["-DX75"],
		SG:   []
	};

	const args: string[] = [
		"-E",
		"-nostdinc",
		`-I${sdkPath}/dietlibc/include`,
		`-I${sdkPath}/swilib/include`,
		`-I${sdkPath}/include`,
		"-D__attribute__(...)=",
		"-DDOXYGEN",
		"-DSWILIB_MODERN",
		"-DSWILIB_PARSE_FUNCTIONS",
		"-DSWILIB_INCLUDE_ALL",
		...defines[platform],
		`${sdkPath}/swilib/include/swilib.h`,
	];

	const { stdout, stderr, code } = await promiseSpawn('arm-none-eabi-gcc', args);
	if (code !== 0)
		throw new Error(`GCC ERROR: ${stderr.toString()}`);

	return stdout.toString()
		// Remove all functions
		.replace(/__swi_begin\s+.*?\s+__swi_end\(.*?\);/sig, '')
		// Remove all comments
		.replace(/^#.*?$/gm, '')
		// Empty lines
		.replace(/^\s+$/gm, '')
		.replace(/^\n+$/gm, '\n');
}

export function getGhidraSymbols(swilibConfig: SwilibConfig, swilib: Swilib, sdklib: Sdklib): string {
	const analysis = analyzeSwilib(swilibConfig, swilib, sdklib);
	const symbols: string[] = [];
	for (let id = 0; id < sdklib.entries.length; id++) {
		const swiEntry = swilib.entries[id];
		const sdkEntry = sdklib.entries[id];
		if (!swiEntry || swiEntry.value == null)
			continue;
		if (analysis.errors[id])
			continue;

		if (sdkEntry.type == SwiType.FUNCTION) {
			// Function
			const signature = sdkEntry.name.replace(/\s+/g, ' ').trim();
			symbols.push(sprintf("F\t%08X\t%s\t%s", swiEntry.value & ~1, sdkEntry.symbol, signature));
		} else if (sdkEntry.type == SwiType.POINTER) {
			let type = dereferenceCType(parseReturnType(sdkEntry.name));
			if (type.toLowerCase() != 'void') {
				// Data
				symbols.push(sprintf("D\t%08X\t%s\t%s", swiEntry.value, sdkEntry.symbol, type));
			} else {
				// Label
				symbols.push(sprintf("L\t%08X\t%s", swiEntry.value, sdkEntry.symbol));
			}
		}
	}
	return symbols.join("\n") + "\n";
}

export function getIdaSymbols(swilibConfig: SwilibConfig, swilib: Swilib, sdklib: Sdklib): string {
	const analysis = analyzeSwilib(swilibConfig, swilib, sdklib);
	const symbols: string[] = [
		`#include <idc.idc>`,
		`static main() {`,
	];
	for (let id = 0; id < sdklib.entries.length; id++) {
		const func = swilib.entries[id];
		const sdkEntry = sdklib.entries[id];
		if (!func || func.value == null)
			continue;
		if (analysis.errors[id])
			continue;
		if (sdkEntry.type == SwiType.FUNCTION) {
			symbols.push(`\tMakeName(${sprintf("0x%08X", func.value & ~1)}, "${sdkEntry.symbol}");`);
		} else if (sdkEntry.type == SwiType.POINTER) {
			symbols.push(`\tMakeName(${sprintf("0x%08X", func.value)}, "${sdkEntry.symbol}");`);
		}
	}
	symbols.push(`}`);
	return symbols.join("\n") + "\n";
}

function dereferenceCType(type: string): string {
	return type.replace(/\*/, '').replace(/\bconst\b/, '').trim();
}

function parseReturnType(def: string): string {
	def = def.replace(/\s+/g, ' ').trim();
	const m = def.match(/^(.*?\s?[*]?)([\w_]+)\((\s*void\s*)?\)$/i);
	if (!m)
		throw new Error(`Can't parse C definition: ${def}`);
	return m[1].trim();
}
