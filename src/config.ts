import fs from 'node:fs';
import toml, { TomlTable, TomlValue } from 'smol-toml';

export type SwiPlatform = 'ELKA' | 'NSG' | 'X75' | 'SG';

const swilibPlatforms: SwiPlatform[] = [
	"ELKA",
	"NSG",
	"X75",
	"SG"
];

export interface SwilibConfig {
	platforms: Map<string, SwiPlatform>;
	targets: string[];
	patches: Map<string, number>;
	functions: {
		pairs: number[][];
		aliases: Map<number, string[]>;
		reserved: Set<number>;
	}
}

export function loadSwilibConfig(sdkPath: string): SwilibConfig {
	const config = toml.parse(fs.readFileSync(`${sdkPath}/swilib/config.toml`).toString());
	const functions = config["functions"] as TomlTable;
	const reserved: Set<number> = new Set();

	const aliases = new Map<number, string[]>();
	for (const [key, value] of Object.entries(functions["aliases"]))
		aliases.set(parseInt(key), value);

	const platforms = new Map<string, SwiPlatform>();
	for (const [key, value] of Object.entries(config["platforms"]))
		platforms.set(key, value);

	const patches = new Map<string, number>();
	for (const [key, value] of Object.entries(config["patches"]))
		patches.set(key, value);

	for (const value of functions["reserved"] as TomlValue[][]) {
		const from = Number(value[0]);
		const to = Number(value[1]);
		for (let id = from; id <= to; id++)
			reserved.add(id);
	}

	return {
		targets: config["targets"] as string[],
		patches,
		platforms,
		functions: {
			pairs: functions["pairs"] as number[][],
			aliases,
			reserved,
		}
	};
}

export function getSwilibPlatforms() {
	return swilibPlatforms;
}

export function isValidSwilibPlatform(platform: string): platform is SwiPlatform {
	return swilibPlatforms.includes(platform as SwiPlatform);
}
