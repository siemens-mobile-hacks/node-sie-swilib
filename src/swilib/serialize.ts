import { analyzeSwilib } from "#src/swilib/analyze.js";
import { sprintf } from "sprintf-js";
import { SwilibConfig } from "#src/config.js";
import { Swilib, SwiType, SwiValueType } from "#src/swilib/parse.js";
import { Sdklib } from "#src/sdklib/parse.js";

export function serializeSwilib(swilibConfig: SwilibConfig, swilib: Swilib, sdklib: Sdklib): string {
	const analysis = analyzeSwilib(swilibConfig, swilib, sdklib);
	const vkp = [];

	if (swilib.target)
		vkp.push(`; ${swilib.target}`);
	vkp.push(`${sprintf("+%08X", swilib.offset)}`);
	vkp.push(`#pragma enable old_equal_ff`);

	for (let id = 0; id < sdklib.entries.length; id++) {
		const swiEntry = swilib.entries[id];
		const sdkEntry = sdklib.entries[id];
		if ((id % 16) == 0)
			vkp.push('');

		const name = (sdkEntry?.name || '').replace(/\s+/gs, ' ').trim();

		if (analysis.errors[id]) {
			vkp.push('');
			vkp.push(`; [ERROR] ${analysis.errors[id]}`);
			if (swiEntry?.value != null) {
				vkp.push(sprintf(";%03X: 0x%08X   ; %3X: %s", id * 4, swiEntry.value, id, name));
			} else {
				vkp.push(sprintf(";%03X:              ; %3X: %s", id * 4, id, name));
			}
			vkp.push('');
		} else if (sdkEntry) {
			if (swiEntry?.comment != null) {
				if (swiEntry?.value != null) {
					vkp.push(sprintf("%04X: 0x%08X   ;%s", id * 4, swiEntry.value, swiEntry.comment));
				} else {
					vkp.push(sprintf(";%03X:              ;%s", id * 4, id, swiEntry.comment));
				}
			} else {
				if (swiEntry?.value != null) {
					vkp.push(sprintf("%04X: 0x%08X   ; %3X: %s", id * 4, swiEntry.value, id, name));
				} else {
					vkp.push(sprintf(";%03X:              ; %3X: %s", id * 4, id, name));
				}
			}
		} else {
			vkp.push(sprintf(";%03X:              ; %3X:", id * 4, id));
		}
	}
	vkp.push('');
	vkp.push(`#pragma enable old_equal_ff`);
	vkp.push(`+0`);
	return vkp.join('\r\n') + "\r\n";
}

export function formatId(id: number): string {
	return id.toString(16).padStart(3, "0").toUpperCase();
}

export function getSwiTypeName(type: SwiType): string {
	switch (type) {
		case SwiType.EMPTY:		return "EMPTY";
		case SwiType.FUNCTION:	return "FUNCTION";
		case SwiType.POINTER:	return "POINTER";
		case SwiType.VALUE:		return "NUMERIC_VALUE";
	}
}

export function getSwiValueTypeName(type: SwiValueType): string {
	switch (type) {
		case SwiValueType.POINTER_TO_FLASH:	return "POINTER_TO_FLASH";
		case SwiValueType.POINTER_TO_RAM:	return "POINTER_TO_RAM";
		case SwiValueType.VALUE:			return "NUMERIC_VALUE";
		case SwiValueType.UNDEFINED:		return "UNDEFINED";
	}
}

export function getSwiBlib(swilib: Swilib): Buffer {
	const blib = Buffer.alloc(16 * 1024);
	for (let id = 0; id < 0x1000; id++) {
		const offset = id * 4;
		const swiEntry = swilib.entries[id];
		if (swiEntry?.value != null) {
			blib.writeUInt32LE(swiEntry.value, offset);
		} else {
			blib.writeUInt32LE(0xFFFFFFFF, offset);
		}
	}
	return blib;
}
