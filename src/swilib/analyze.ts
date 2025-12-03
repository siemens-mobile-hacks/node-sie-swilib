import { isValidSwiPlatform, SwilibConfig, SwiPlatform } from "#src/config";
import { formatId, getSwiTypeName, getSwiValueTypeName } from "#src/swilib/serialize";
import { SwiEntry, Swilib, SwiType, SwiValueType } from "#src/swilib/parse";
import { SdkEntry } from "#src/sdklib/parse";

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

export function analyzeSwilib(swilibConfig: SwilibConfig, platform: SwiPlatform, sdklib: SdkEntry[], swilib: Swilib): SwilibAnalysisResult {
	const maxFunctionId = Math.max(sdklib.length, swilib.entries.length);
	const errors: Record<number, string> = {};
	const duplicates: Record<number, number> = {};
	const missing: number[] = [];
	const functionPairs = getFunctionPairs(swilibConfig);
	let goodCnt = 0;
	let totalCnt = 0;
	let unusedCnt = 0;

	if (!isValidSwiPlatform(platform))
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

		if (!isSameFunctions(swilibConfig, sdklib[id], func)) {
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

function isSameFunctions(swilibConfig: SwilibConfig, targetFunc: SdkEntry, checkFunc: SwiEntry) {
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
	if (isStrInArray(swilibConfig.aliases.get(targetFunc.id), checkFunc.symbol))
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
	for (const p of swilibConfig.pairs) {
		for (let i = 0; i < p.length; i++)
			functionPairs[p[i]] = p;
	}
	return functionPairs;
}
