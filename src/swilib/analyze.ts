import { SwilibConfig } from "#src/config.js";
import { formatId, getSwiTypeName, getSwiValueTypeName } from "#src/swilib/serialize.js";
import { SwiEntry, Swilib, SwiType, SwiValueType } from "#src/swilib/parse.js";
import { SdkEntry, Sdklib } from "#src/sdklib/parse.js";

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

export function analyzeSwilib(config: SwilibConfig, swilib: Swilib, sdklib: Sdklib): SwilibAnalysisResult {
	const maxFunctionId = Math.max(sdklib.entries.length, swilib.entries.length);
	const errors: Record<number, string> = {};
	const duplicates: Record<number, number> = {};
	const missing: number[] = [];
	const functionPairs = getFunctionPairs(config);
	const platform = swilib.platform;
	let goodCnt = 0;
	let totalCnt = 0;
	let unusedCnt = 0;

	for (let id = 0; id < maxFunctionId; id++) {
		const swiEntry = swilib.entries[id];
		const sdkEntry = sdklib.entries[id];
		if (!sdkEntry && !swiEntry) {
			unusedCnt++;
			continue;
		}

		totalCnt++;

		if (!sdkEntry) {
			errors[id] = `Unknown function: ${swiEntry!.symbol}`;
			continue;
		}

		if (functionPairs[id]) {
			const masterFunc = swilib.entries[functionPairs[id][0]];
			if (masterFunc && (!swiEntry || masterFunc.value != swiEntry.value)) {
				const expectedValue = masterFunc.value.toString(16).padStart(8, '0').toUpperCase();
				errors[id] = `Address must be equal with #${formatId(masterFunc.id)} ${masterFunc.symbol} (0x${expectedValue}).`;
			}
		}

		if (!swiEntry) {
			if (!sdkEntry.builtin)
				missing.push(id);
			continue;
		}

		if (sdkEntry.builtin?.includes(platform) && swiEntry) {
			errors[id] = `Invalid function: ${swiEntry.symbol} (Reserved by ELFLoader)`;
			continue;
		}

		if (config.functions.reserved.has(id) && swiEntry) {
			errors[id] = `Invalid function: ${swiEntry.symbol} (Reserved by ELFLoader)`;
			continue;
		}

		if (sdkEntry?.platforms && !sdkEntry.platforms!.includes(platform) && swiEntry) {
			errors[id] = `Functions is not available on this platform.`;
			continue;
		}

		if (!isSameFunctions(config, swiEntry, sdkEntry)) {
			errors[id] = `Invalid function: ${swiEntry.symbol}`;
			continue;
		}

		if ((BigInt(swiEntry.value) & 0xF0000000n) == 0xA0000000n) {
			if (duplicates[swiEntry.value]) {
				const dupId = duplicates[swiEntry.value];
				if (!functionPairs[swiEntry.id] || !functionPairs[swiEntry.id].includes(dupId))
					errors[id] = `Address already used for #${formatId(dupId)} ${sdklib.entries[dupId]?.symbol}.`;
			}
		}

		if (!errors[id] && swiEntry.type != SwiValueType.UNDEFINED) {
			const typeError = checkTypeConsistency(swiEntry, sdkEntry);
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

function checkTypeConsistency(swiEntry: SwiEntry, sdkEntry: SdkEntry): string | undefined {
	const typesMap: Record<SwiType, SwiValueType[]> = {
		[SwiType.FUNCTION]:		[SwiValueType.POINTER_TO_FLASH],
		[SwiType.POINTER]:		[SwiValueType.POINTER_TO_FLASH, SwiValueType.POINTER_TO_RAM],
		[SwiType.VALUE]:		[SwiValueType.VALUE],
		[SwiType.EMPTY]:		[],
	};
	if (!typesMap[sdkEntry.type].includes(swiEntry.type))
		return `Type mismatch: ${getSwiValueTypeName(swiEntry.type)} (SWILIB) is not allowed for ${getSwiTypeName(sdkEntry.type)} (SDK).`;
	return undefined;
}

function isSameFunctions(config: SwilibConfig, swiEntry: SwiEntry, sdkEntry: SdkEntry) {
	if (!sdkEntry && !swiEntry)
		return true;
	if (!sdkEntry || !swiEntry)
		return false;
	if (sdkEntry.id != swiEntry.id)
		return false;
	if (sdkEntry.symbol == swiEntry.symbol)
		return true;
	if (isStrInArray(sdkEntry.aliases, swiEntry.symbol))
		return true;
	if (isStrInArray(config.functions.aliases.get(sdkEntry.id), swiEntry.symbol))
		return true;
	return false;
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

function getFunctionPairs(swilibConfig: SwilibConfig): Record<number, number[]> {
	const functionPairs: Record<number, number[]> = {};
	for (const p of swilibConfig.functions.pairs) {
		for (let i = 0; i < p.length; i++)
			functionPairs[p[i]] = p;
	}
	return functionPairs;
}
