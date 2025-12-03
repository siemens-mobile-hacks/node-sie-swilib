import fs from 'node:fs';
import toml from 'smol-toml';

export type SwiPlatform = 'ELKA' | 'NSG' | 'X75' | 'SG';

const swilibPlatforms: SwiPlatform[] = [
	"ELKA",
	"NSG",
	"X75",
	"SG"
];

export interface SwilibConfig {
	platforms: Map<string, SwiPlatform>;
	phones: string[];
	patches: Record<string, number>;
	pairs: number[][];
	aliases: Map<number, string[]>;
}

export function loadSwilibConfig(sdkPath: string): SwilibConfig {
	const config = toml.parse(fs.readFileSync(`${sdkPath}/swilib/config.toml`).toString());

	const aliases = new Map<number, string[]>();
	for (const [key, value] of Object.entries(config["aliases"]))
		aliases.set(parseInt(key), value);

	const platforms = new Map<string, SwiPlatform>();
	for (const [key, value] of Object.entries(config["platforms"]))
		platforms.set(key, value);

	return {
		phones: config["phones"] as string[],
		patches: config["patches"] as Record<string, number>,
		pairs: config["pairs"] as number[][],
		aliases,
		platforms
	};
}

export function getSwilibPlatforms() {
	return swilibPlatforms;
}

export function isValidSwiPlatform(platform: string): platform is SwiPlatform {
	return swilibPlatforms.includes(platform as SwiPlatform);
}
