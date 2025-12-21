import { SwilibConfig, SwiPlatform } from "#src/config.js";

export function getSwilibPlatform(swilibConfig: SwilibConfig, target: string): SwiPlatform {
	const phone = target.replace(/(sw|v)\d+$/i, '');

	// From config
	if (swilibConfig.platforms.has(phone))
		return swilibConfig.platforms.get(phone)!;

	// Heuristics
	if (/^(EL71|E71|ELF71|CL61|M72|C1F0)[a-z]?$/i.test(phone))
		return "ELKA";
	if (/^(C81|S75|SL75|S68)[a-z]?$/i.test(phone))
		return "NSG";
	if (/^([A-Z]+)(75|72)[a-z]?$/i.test(phone))
		return "X75";
	return "SG";
}

export function compareSwilibFunc(swilibConfig: SwilibConfig, swiNumber: number, oldName: string, newName: string): boolean {
	if (newName == oldName)
		return true;
	const aliases = swilibConfig.functions.aliases.get(swiNumber);
	if (aliases)
		return aliases.includes(oldName);
	return false;
}
