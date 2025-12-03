import { isValidSwiPlatform, SwilibConfig, SwiPlatform } from "#src/config";

export function getPlatformByPhone(swilibConfig: SwilibConfig, phone: string): SwiPlatform {
	if (swilibConfig.platforms.has(phone))
		return swilibConfig.platforms.get(phone)!;
	if (isValidSwiPlatform(phone))
		return phone as SwiPlatform;

	// Heuristics
	const m = phone.match(/^(.*?)(?:v|sw)([\d+_]+)$/i);
	if (!m)
		throw new Error(`Invalid phone model: ${phone}`);
	const model = m[1];
	if (/^(EL71|E71|ELF71|CL61|M72|C1F0)[a-z]?$/i.test(model))
		return "ELKA";
	if (/^(C81|S75|SL75|S68)[a-z]?$/i.test(model))
		return "NSG";
	if (/^([A-Z]+)(75|72)[a-z]?$/i.test(model))
		return "X75";
	return "SG";
}

export function compareSwilibFunc(swilibConfig: SwilibConfig, swiNumber: number, oldName: string, newName: string): boolean {
	if (newName == oldName)
		return true;
	const aliases = swilibConfig.aliases.get(swiNumber);
	if (aliases)
		return aliases.includes(oldName);
	return false;
}
