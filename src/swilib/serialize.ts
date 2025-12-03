import { analyzeSwilib } from "#src/swilib/analyze";
import { sprintf } from "sprintf-js";
import { SwilibConfig } from "#src/config";
import { Swilib, SwiType, SwiValueType } from "#src/swilib/parse";
import { getPlatformByPhone } from "#src/swilib/utils";
import { SdkEntry } from "#src/sdklib/parse";

export function serializeSwilib(swilibConfig: SwilibConfig, phone: string, sdklib: SdkEntry[], swilib: Swilib): string {
	const platform = getPlatformByPhone(swilibConfig, phone);
	const analysis = analyzeSwilib(swilibConfig, platform, sdklib, swilib);
	const vkp = [
		`; ${phone}`,
		`${sprintf("+%08X", swilib.offset)}`,
		`#pragma enable old_equal_ff`,
	];
	for (let id = 0; id < sdklib.length; id++) {
		const func = swilib.entries[id];
		if ((id % 16) == 0)
			vkp.push('');

		const name = (sdklib[id]?.name || '').replace(/\s+/gs, ' ').trim();

		if (analysis.errors[id]) {
			vkp.push('');
			vkp.push(`; [ERROR] ${analysis.errors[id]}`);
			if (func?.value != null) {
				vkp.push(sprintf(";%03X: 0x%08X   ; %3X: %s", id * 4, func.value, id, name));
			} else {
				vkp.push(sprintf(";%03X:              ; %3X: %s", id * 4, id, name));
			}
			vkp.push('');
		} else if (sdklib[id]) {
			if (func?.comment != null) {
				if (func?.value != null) {
					vkp.push(sprintf("%04X: 0x%08X   ;%s", id * 4, func.value, func.comment));
				} else {
					vkp.push(sprintf(";%03X:              ;%s", id * 4, id, func.comment));
				}
			} else {
				if (func?.value != null) {
					vkp.push(sprintf("%04X: 0x%08X   ; %3X: %s", id * 4, func.value, id, name));
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
	return vkp.join('\r\n');
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
		if (swilib.entries[id]?.value != null) {
			blib.writeUInt32LE(swilib.entries[id].value, offset);
		} else {
			blib.writeUInt32LE(0xFFFFFFFF, offset);
		}
	}
	return blib;
}
