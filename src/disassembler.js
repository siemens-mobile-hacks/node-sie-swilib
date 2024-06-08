import child_process from 'node:child_process';
import { SwiType, analyzeSwilib, getPlatformByPhone } from './swilib.js';
import { sprintf } from 'sprintf-js';

export function getDataTypesHeader(sdk, platform) {
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
		"-D__attribute__(...)=",
		"-DDOXYGEN",
		"-DSWILIB_MODERN",
		"-DSWILIB_PARSE_FUNCTIONS",
		"-DSWILIB_INCLUDE_ALL",
		...defines[platform],
		`${sdk}/swilib/include/swilib.h`,
	];

	let { stdout, stderr, status } = child_process.spawnSync('arm-none-eabi-gcc', args);
	if (status != 0)
		throw new Error(`GCC ERROR: ${stderr.toString()}`);

	stdout = stdout.toString();

	stdout = stdout
		// Remove all functions
		.replace(/__swi_begin\s+.*?\s+__swi_end\(.*?\);/sig, '')
		// Remove all comments
		.replace(/^#.*?$/gm, '')
		// Empty lines
		.replace(/^\s+$/gm, '')
		.replace(/^[\n]+$/gm, '\n');

	return stdout;
}

export function getGhidraSymbols(phone, sdklib, swilib) {
	let analysis = analyzeSwilib(getPlatformByPhone(phone), sdklib, swilib);
	let symbols = [];
	for (let id = 0; id < sdklib.length; id++) {
		let func = swilib.entries[id];
		if (!func || func.value == null)
			continue;
		if (analysis.errors[id])
			continue;

		if (sdklib[id].type == SwiType.FUNCTION) {
			// Function
			let signature = sdklib[id].name.replace(/\s+/g, ' ').trim();
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

export function getIdaSymbols(phone, sdklib, swilib) {
	let analysis = analyzeSwilib(getPlatformByPhone(phone), sdklib, swilib);
	let symbols = [
		`#include <idc.idc>`,
		`static main() {`,
	];
	for (let id = 0; id < sdklib.length; id++) {
		let func = swilib.entries[id];
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

function dereferenceCType(type) {
	return type.replace(/\*/, '').replace(/\bconst\b/, '').trim();
}

function parseReturnType(def) {
	def = def.replace(/\s+/g, ' ').trim();
	let m = def.match(/^(.*?\s?[*]?)([\w\d_]+)\((\s*void\s*)?\)$/i);
	if (!m)
		throw new Error(`Can't parse C definition: ${def}`);
	return m[1].trim();
}
