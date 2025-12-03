import { vkpNormalize, VkpParseError, vkpRawParser } from "@sie-js/vkp";

export enum SwiValueType {
	UNDEFINED,
	POINTER_TO_RAM,
	POINTER_TO_FLASH,
	VALUE,
}

export enum SwiType {
	EMPTY,
	FUNCTION,
	POINTER,
	VALUE,
}

export type SwiEntry = {
	id: number;
	value: number;
	symbol: string;
	type: SwiValueType;
	comment?: string;
};

export type Swilib = {
	offset: number;
	entries: SwiEntry[];
};

export type SwilibParserOptions = {
	comments?: boolean;
};

export function parseSwilibPatch(code: string | Buffer, options: SwilibParserOptions = {}): Swilib {
	let offset: number | undefined;
	const entries: SwiEntry[] = [];
	let end = false;

	const validOptions = {
		comments: false,
		...options,
	};

	if (Buffer.isBuffer(code))
		code = vkpNormalize(code);

	vkpRawParser(code, {
		onOffset(value, loc) {
			if (value.offset == 0) {
				end = true;
				return;
			}
			if (offset != null)
				throw new VkpParseError(`Duplicated offset`, loc);
			offset = value.offset;
		},
		onPatchData(data, loc) {
			if (end)
				throw new VkpParseError(`Entry after end`, loc);
			if (!offset)
				throw new VkpParseError(`Entry without offset`, loc);
			if (data.new.buffer.length != 4)
				throw new VkpParseError(`Value length is not equal 4`, loc);
			if ((data.address % 4) != 0)
				throw new VkpParseError(`Address is not aligned to 4`, loc);

			const value = data.new.buffer.readUInt32LE(0);
			const symbol = parseSwilibFuncName(data.comment);
			if (!symbol)
				throw new VkpParseError(`Invalid comment: ${data.comment}`, loc);

			const id = data.address / 4;
			entries[id] = {id, value, symbol, type: SwiValueType.UNDEFINED};
			entries[id].type = getSwilibValueType(entries[id]);

			if (validOptions.comments) {
				entries[id].comment = data.comment;
			}
		},
		onError(e) {
			throw new Error(`${e.message}\n${e.codeFrame(code)}`);
		}
	});

	return {offset: offset ?? 0, entries};
}

function parseSwilibFuncName(comm: string): string | undefined {
	comm = comm
		.replace(/^\s*0x[a-f0-9]+/i, '')
		.replace(/\/\/.*?$/i, '') // comments in comments
		.replace(/(;|\*NEW\*|\?\?\?)/gi, '')
		.replace(/Run ScreenShooter on function /g, '')
		.replace(/\((API|MP|Disp)\)/, '') // thanks dimonp25
		.replace(/С/gi, 'C') // cyrillic C
		.trim();

	let m: RegExpMatchArray | null;
	if ((m = comm.match(/^-?([a-f0-9]+)(?::?\s+|:)([\w_ *-]*\s*[*\s]+)?([\w_]+)\s*\(/i))) {
		return m[3];
	} else if ((m = comm.match(/^-?([a-f0-9]+)(?::?\s+|:)([\w_ *-]*\s*[*\s]+)?([\w_]+)$/i))) {
		return m[3];
	} else if ((m = comm.match(/^([a-f0-9]+):$/i))) {
		return `FUNC_${m[1]}`;
	}

	return undefined;
}

function getSwilibValueType(entry: SwiEntry): SwiValueType {
	if (entry != null && entry.value != 0xFFFFFFFF) {
		const addr = BigInt(entry.value) & 0xFF000000n;
		if (addr >= 0xA0000000n && addr < 0xA8000000n) {
			return SwiValueType.POINTER_TO_FLASH;
		} else if (addr >= 0xA8000000n && addr < 0xB0000000n) {
			return SwiValueType.POINTER_TO_RAM;
		} else {
			return SwiValueType.VALUE;
		}
	}
	return SwiValueType.UNDEFINED;
}
