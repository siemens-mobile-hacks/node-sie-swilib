import child_process from 'node:child_process';
import { analyzeSwilib, SdkEntry, Swilib, SwiType } from './swilib.js';
import { sprintf } from 'sprintf-js';
import { SwiPlatform } from "./config.js";

export function getDataTypesHeader(sdkPath: string, platform: SwiPlatform): string {
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

	const result = child_process.spawnSync('arm-none-eabi-gcc', args);
	const { stdout, stderr, status } = result;

	if (status !== 0)
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

export function getGhidraSymbols(platform: SwiPlatform, sdklib: SdkEntry[], swilib: Swilib): string {
	const analysis = analyzeSwilib(platform, sdklib, swilib);
	const symbols: string[] = [];
	for (let id = 0; id < sdklib.length; id++) {
		const func = swilib.entries[id];
		if (!func || func.value == null)
			continue;
		if (analysis.errors[id])
			continue;

		if (sdklib[id].type == SwiType.FUNCTION) {
			// Function
			const signature = sdklib[id].name.replace(/\s+/g, ' ').trim();
			symbols.push(sprintf("F\t%08X\t%s\t%s", func.value & ~1, sdklib[id].symbol, signature));
		} else if (sdklib[id].type == SwiType.POINTER) {
			let type = dereferenceCType(parseReturnType(sdklib[id].name));
			if (type.toLowerCase() != 'void') {
				// Data
				symbols.push(sprintf("D\t%08X\t%s\t%s", func.value, sdklib[id].symbol, type));
			} else {
				// Label
				symbols.push(sprintf("L\t%08X\t%s", func.value, sdklib[id].symbol));
			}
		}
	}
	return symbols.join("\n");
}

export function getIdaSymbols(platform: SwiPlatform, sdklib: SdkEntry[], swilib: Swilib): string {
	const analysis = analyzeSwilib(platform, sdklib, swilib);
	const symbols: string[] = [
		`#include <idc.idc>`,
		`static main() {`,
	];
	for (let id = 0; id < sdklib.length; id++) {
		const func = swilib.entries[id];
		if (!func || func.value == null)
			continue;
		if (analysis.errors[id])
			continue;
		if (sdklib[id].type == SwiType.FUNCTION) {
			symbols.push(`\tMakeName(${sprintf("0x%08X", func.value & ~1)}, "${sdklib[id].symbol}");`);
		} else if (sdklib[id].type == SwiType.POINTER) {
			symbols.push(`\tMakeName(${sprintf("0x%08X", func.value)}, "${sdklib[id].symbol}");`);
		}
	}
	symbols.push(`}`);
	return symbols.join("\n");
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
