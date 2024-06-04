// Swilib quirks
export default {
	// Platforms
	platforms: ["ELKA", "NSG", "X75", "SG"],

	// Supported phones
	phones: [
		// NSG ELKA
		'E71v45',
		'EL71v45',

		// NSG
		'C81v51',
		'S75v52',
		'SL75v52',
		'S68v47',

		// SG X75
		'CX75v25',
		'CX75v13',
		'M75v25',
		'CF75v23',
		'C75v24',
		'C72v22',

		// SG
		'CX70v56',
		'SK65v50',
		'SL65v53',
		'S65v58',
	],

	// Functions wich available only on certain platforms.
	platformDependentFunctions: {
		0x036:		["ELKA"],		// SLI_SetState
		0x1A2:		["X75", "SG"],	// ActivateDialUpProfile
		0x1A3:		["X75", "SG"],	// GetCurrentGPRSProfile
		0x1A4:		["X75", "SG"],	// GetDisconnectTime
		0x1A5:		["X75", "SG"],	// RegisterCepIdForCurProfile
		0x23C:		["X75", "SG"],	// SetCurrentGPRSProfile
		0x237:		["ELKA"],		// RamIconBar

		// China
		0x242:		[],	// gb2ws
		0x243:		[],	// ws2gb
		0x234:		[],	// GetLunarDate
		0x235:		[],	// GetLunarYearID
		0x236:		[],	// GetLunarAnimal
	},

	// Not a functions, but points to the fullflash
	forcePointers: [
		0x0F1,	// BuildCanvas
		0x0FF,	// AddrLibrary
		0x3C5,	// GetPBarProc3
		0x0F8,	// Additional_PIT_address
		0x0FC,	// PictureRelocationTableAddr
	],

	// ELFLoader builtin functions
	builtin: {
		0x00B: ["X75", "SG"],					// sys_read
		0x00C: ["X75", "SG"],					// sys_write
		0x095: ["X75", "SG"],					// UnRegExplorerExt
		0x12B: ["X75", "SG"],					// AddKeybMsgHook
		0x12C: ["X75", "SG"],					// AddKeybMsgHook_end
		0x12D: ["X75", "SG"],					// RemoveKeybMsgHook
		0x171: ["ELKA", "NSG", "X75", "SG"],	// SUBPROC
		0x172: ["ELKA", "NSG", "X75", "SG"],	// REDRAW
		0x19C: ["ELKA", "NSG", "X75", "SG"],	// SEQKILLER
		0x1B8: ["ELKA", "NSG", "X75", "SG"],	// EXT_TOP
		0x1B9: ["ELKA", "NSG", "X75", "SG"],	// PNG_TOP
		0x1BA: ["ELKA", "NSG", "X75", "SG"],	// LIB_TOP
		0x1E9: ["ELKA", "NSG", "X75", "SG"],	// CreateIMGHDRFromPngFile
		0x2EE: ["ELKA", "NSG", "X75", "SG"],	// elfclose
		0x2EF: ["ELKA", "NSG", "X75", "SG"],	// dlopen
		0x2F0: ["ELKA", "NSG", "X75", "SG"],	// dlsym
		0x2F1: ["ELKA", "NSG", "X75", "SG"],	// dlclose
		0x2F2: ["ELKA", "NSG", "X75", "SG"],	// setenv
		0x2F3: ["ELKA", "NSG", "X75", "SG"],	// unsetenv
		0x2F4: ["ELKA", "NSG", "X75", "SG"],	// getenv
		0x2F5: ["ELKA", "NSG", "X75", "SG"],	// clearenv
		0x2F6: ["ELKA", "NSG", "X75", "SG"],	// getBaseEnviron
		0x2F7: ["ELKA", "NSG", "X75", "SG"],	// dlerror
		0x2F8: ["ELKA", "NSG", "X75", "SG"],	// dlclean_cache
		0x2F9: ["ELKA", "NSG", "X75", "SG"],	// SHARED_TOP
	},

	// swilib.vkp patches
	patches: {
		"S65v58": 7545,
		"SK65v50": 7546,
		"SL65v53": 10131,
		"CX70v56": 10625,
		"C72v22": 6954,

		"C75v22": 10518,
		"C75v24": 10516,
		"CF75v23": 10542,
		"M75v25": 4673,
		"CX75v13": 6285,
		"CX75v25": 4736,

		"S68v47": 6630,

		"SL75v47": 10522,
		"SL75v52": 7634,
		"S75v47": 5624,
		"S75v52": 8285,
		"C81v51": 10629,

		"EL71v45": 10076,
		"E71v45": 10075,
		"CL61v128": 10395
	},

	// Duplicated functions in swilib
	pairs: [
		[0x000, 0x001, 0x002, 0x003, 0x004, 0x0AB], // loopback's
		[0x129, 0x0A5], // FreeWS
		[0x146, 0x069], // LockSched
		[0x147, 0x06A], // UnlockSched
		[0x150, 0x071], // DrawRoundedFrame
		[0x1A6, 0x057], // IsTimerProc
		[0x117, 0x031], // strrchr
		[0x11C, 0x053], // memcmp
		[0x11E, 0x059], // memcpy
		[0x124, 0x0A0], // wsprintf
		[0x125, 0x0A4], // AllocWS
		[0x12E, 0x03F], // GetPaletteAdrByColorIndex
		[0x13B, 0x064], // GeneralFuncF1
		[0x364, 0x1F3], // NU_Retrieve_Clock
		[0x365, 0x366], // NU_Release_Information
		[0x254, 0x22E], // StartNativeExplorer
		[0x14B, 0x077], // DrwObj_SetColor
		[0x1B4, 0x09F], // DrawRectangle
		[0x1AB, 0x1D6, 0x1AD], // png_set_palette_to_rgb
	],

	// Functions from patches
	fromPatches: [
		0x0C1, // RunDispatcher
		0x0C2, // GetAllPatchesByInject
		0x0C4, // GetBuffer
		0x0BE, // RunScaner
		0x0E4, // FreeRAM
		0x011, // OpenReadCloseFile
		0x007, // GetLP
		0x1F9, // SendMP_cmd
		0x0AD, // StrAnsi2Uni
		0x0AE, // StrUni2Ansi
		0x0B0, // DrawPicWithCanvas
		0x0B1, // DrawColorPicWithCanvas
		0x0AC, // DrawText
		0x0C3, // ProcessFiles
		0x056, // PlayVibra
		0x098, // PlaySoundVibra
		0x097, // CreatePath
		0x0B3, // Seconds2iTime
		0x1F7, // GetFileSize
		0x088, // GetAccessoryType
		0x200, // ScreenShoot
		0x0BF, // SpellTime
		0x1BB, // DATA_N_SFB
		0x10A, // GetConfig
		0x10E, // Vibration
		0x10B, // GetMinAdrScan
		0x10C, // GetMaxAdrScan
		0x0FB, // ShortcutsTableAddr
		0x0FC, // PictureRelocationTableAddr
		0x0FD, // PictureRelocationBaseAddr
		0x0FE, // NextPictureMagicValue
		0x0F8, // Additional_PIT_address
		0x0F9, // Additional_PIT_start
		0x0FA, // Additional_PIT_end
		0x0C0, // MiniGPS
		0x1EE, // ProgressCalculate
		0x0B2, // GetBuildCanvas
		0x234, // GetLunarDate
		0x235, // GetLunarYearID
		0x236, // GetLunarAnimal
		0x0C7, // CallLibFunByNumber
	],

	// Legacy function aliases
	aliases: {
		0x000:	/* loopback0 */								["SWI0", "SWI_0"],
		0x001:	/* loopback1 */								["SWI1", "SWI_1"],
		0x002:	/* loopback2 */								["SWI2", "SWI_2"],
		0x003:	/* loopback3 */								["SWI3", "SWI_3"],
		0x004:	/* loopback4 */								["SWI4", "SWI_4"],
		0x005:	/* StrToHex */								["DecToHex"],
		0x01A:	/* strcpy */								["strcopy"],
		0x024:	/* DrawImg_2 */								["DrawImage2"],
		0x02C:	/* EEFullGetBlockInfo */					["getEEFullBlockSizeVersion"],
		0x031:	/* strrchr_2 */								["StrChrRev", "strrchr"],
		0x033:	/* SoundAE_PlayFileAsEvent */				["PlaySound2"],
		0x03F:	/* GetPaletteAdrByColorIndex_2 */			["GetPaletteAdrByColorIndex", "SelectColor"],
		0x044:	/* TempLightOn */							["TempLigntOn"],
		0x04D:	/* GBS_StartTimerProc */					["CallAfterTimer"],
		0x04E:	/* MsgBoxError */							["ShowMsgInR1_3"],
		0x04F:	/* MsgBoxYesNo */							["ShowMsgInR1_4"],
		0x050:	/* MsgBoxOkCancel */						["ShowMsgInR1_7"],
		0x051:	/* GetNetAccessMode */						["GetNetMode"],
		0x053:	/* memcmp_2 */								["memcmp"],
		0x057:	/* IsTimerProc_2 */							["IsTimerProc", "IsCallAfterTimerStillRunning"],
		0x058:	/* ClearMemory */							["zeromem_2"],
		0x059:	/* memcpy_2 */								["memcpy"],
		0x05F:	/* GetFreeRamAvail */						["GetNonPermMemAvail"],
		0x063:	/* MMI_CanvasBuffer_FlushV */				["MS_Wallpaper_Flush", "Screen_Wallpaper_Flush"],
		0x064:	/* GeneralFuncF1_2 */						["TriggerUpdate"],
		0x069:	/* LockSched_2 */							["LockSched", "LockShed"],
		0x06A:	/* UnlockSched_2 */							["UnlockSched", "UnLockShed"],
		0x071:	/* DrawRoundedFrame_2 */					["DrawRoundRect", "DrawFrame"],
		0x072:	/* GetDurationFromCurrentCall */			["SetCurrentSecondOfCall", "GetCurrentSecondOfCall"],
		0x075:	/* IsCanvasBufferSet */						["StoreXYWHtoRECT"],
		0x077:	/* DrwObj_SetColor_2 */						["set2color_byPaletteAdr", "SetColor", "SetWindowColor"],
		0x079:	/* DrawObject2Layer */						["DrawObject", "DrawObject_2", "PushWindowBuffer"],
		0x07A:	/* LCDLAYER_Flush */						["UpdateDisplayByLayerPtr", "ClearWindowBuffer"],
		0x080:	/* ShowCallList */							["GetCallsList"],
		0x081:	/* HexCharToInt */							["HexToDec"],
		0x082:	/* GetLastAudioTrackFilename */				["GetCurrentTrackFilename"],
		0x085:	/* strcasecmp */							["StrCmpNoCase"],
		0x086:	/* EEFullReadBlock */						["ReadEEPROMData"],
		0x087:	/* EEFullWriteBlock */						["WriteEEPROMData"],
		0x08D:	/* getCurrentProfileName */					["GetProfileName"],
		0x09B:	/* RamAudioParamsAddr */					["addr"],
		0x09F:	/* DrawRectangle_2 */						["DrawRect"],
		0x0A0:	/* wsprintf_2 */							["Unicode_sprintf", "ws_sprintf", "wsprintf"],
		0x0A1:	/* wstrcpy_2 */								["Unicode_CopyStr2Str", "wstrcpy"],
		0x0A2:	/* wsCharAt */								["WS_GetCharByPosition", "Unicode_GetCharByPosition", "ws_GetChar"],
		0x0A3:	/* ws_2str */								["ws2str"],
		0x0A4:	/* AllocWS_2 */								["AllocWS", "wsAlloc"],
		0x0A5:	/* FreeWS_2 */								["wsFree"],
		0x0AB:	/* loopback171 */							["SWI_AB"],
		0x0AF:	/* HexToInt */								["Hex2Int"],
		0x0B8:	/* sdiv */									["dwMODdw"],
		0x0BC:	/* udiv */									["divide"],
		0x0BD:	/* DivBy10 */								["udiv", "divide"],
		0x0BE:	/* RunScaner */								["RunScanner"],
		0x0CF:	/* RamAlarmClockState */					["RamAlarm"],
		0x0D1:	/* RamScreenSaverCSM */						["RamScreensaver"],
		0x0D2:	/* RamIsAutoTimeEnabled */					["RamAutoTime"],
		0x0D3:	/* RamIsStandby */							["RamStby"],
		0x0D4:	/* RamMissedMessage */						["RamMissedMes"],
		0x0DB:	/* RamIsNotOnMainscreen */					["RamNotOnMainscreen"],
		0x0E6:	/* PIT_Pic_Big */							["Pic_Big0", "Pic_Big"],
		0x0E7:	/* PIT_Pic_Little */						["Pic_Little0", "Pic_Little"],
		0x0E8:	/* PIT_Pic_Extra */							["Pic_Extra"],
		0x0E9:	/* PIT_Pic_Profiles */						["Pic_Profiles"],
		0x0EA:	/* PIT_Pic_Vibra */							["Pic_Vibra"],
		0x0EB:	/* PIT_Pic_Call */							["Pic_Call"],
		0x0EC:	/* PIT_Pic_AdvNet */						["Pic_AdvNet"],
		0x0EF:	/* PIT_Pic_Calendar */						["Pic_Calendar"],
		0x0F0:	/* PIT_Pic_AccuGraph */						["Pic_AccuGraph"],
		0x0F4:	/* PIT_Pic_Lani */							["Pic_LANI"],
		0x0F5:	/* Ram_LCD_Overlay_Layer */					["Ram_LCDLAYER_Overlay_Ptr"],
		0x0F6:	/* RamLcdMainLayersList */					["RAM_LCD_Layer_Base_Ptr", "Ram_Layer_Base_Ptr", "RAM_LCDLAYER_MMI_Ptr"],
		0x0F7:	/* RamLcdRapLayersList */					["RAM_LCDLAYER_Bearer_Ptr"],
		0x0FB:	/* ShortcutsTableAddr */					["Table", "FUNC_0FB"],
		0x0FC:	/* PictureRelocationTableAddr */			["PictureRelocationTable"],
		0x0FD:	/* PictureRelocationBaseAddr */				["PictureRelocationBase"],
		0x0FE:	/* NextPictureMagicValue */					["NextPictureMagic"],
		0x101:	/* GBS_ReciveMessage */						["GBS_ReceiveMessage", "GBS_RecieveMessage"],
		0x117:	/* strrchr */								["strrchr_2"],
		0x11C:	/* memcmp */								["memcmp_2"],
		0x11E:	/* memcpy */								["memcpy_2"],
		0x11F:	/* wstrcpy */								["wstrcpy_2"],
		0x124:	/* wsprintf */								["wsprintf_2"],
		0x12A:	/* DrawObject */							["DrawObject_2"],
		0x12E:	/* GetPaletteAdrByColorIndex */				["GetPaletteAdrByColorIndex_2"],
		0x133:	/* StoreXYWHtoRECT */						["StoreXYWHtoRECT_2"],
		0x146:	/* LockSched */								["LockSched_2", "LockSchedNoTskContext"],
		0x147:	/* UnlockSched */							["UnlockSched_2", "UnlockSchedNoTskContext"],
		0x149:	/* DrwObj_InitText */						["SetPropToText"],
		0x150:	/* DrawRoundedFrame */						["DrawFrameInNativeMenu"],
		0x16C:	/* str_2ws */								["str2ws"],
		0x193:	/* MutexLockEx */							["MutexUnlock"],
		0x1A7:	/* Get_CC_NC */								["Get_NC_CC"],
		0x1CF:	/* get_regextpnt_by_uid */					["GetEXPLEXTByRegN"],
		0x1D5:	/* Get_Phone_Info */						["Get_Phone_Ino"],
		0x1F0:	/* ExplorerCopyFile */						["filecopy"],
		0x1F1:	/* ExplorerSetTransferState */				["filecopy_op_announce"],
		0x1F2:	/* Devmenu_Config_IsCheckboxOff */			["_config_IsCheckboxOff"],
		0x1F4:	/* RamServiceProviderName */				["RAM_SPN"],
		0x1FA:	/* RamVolumeLevel */						["RamVolumeStep"],
		0x1FD:	/* DrwObj_InitRect */						["SetProp2Square_v2"],
		0x1FE:	/* RamIsCameraLighterOn */					["RamLighterPower"],
		0x210:	/* GetCurGuiID */							["GetGurGuiId"],
		0x216:	/* wstrcatprintf */							["wstrcarprintf"],
		0x231:	/* RamActiveAppointment */					["RamAppointment"],
		0x247:	/* GSM_L1_Disable */						["NetOff"],
		0x248:	/* RamMediaPlayerCurrentTrackFormat */		["RamFormatTrack"],
		0x249:	/* RamMediaPlayerCurrentTrackFreq */		["RamFreq"],
		0x24A:	/* RamMediaPlayerCurrentTrackChannels */	["RamChannel"],
		0x24C:	/* GetPeripheryState */						["GetDevState"],
		0x24E:	/* GetPlayObjById */						["Obs_GetById"],
		0x24F:	/* GetPlayObjPosition */					["Obs_GetPosition"],
		0x250:	/* GetPlayObjDuration */					["Obs_GetDuration"],
		0x252:	/* RamSizeOfReceivedOrSentFile */			["RamSizeOfRecievedSendFile"],
		0x256:	/* RamNameOfReceivedOrSentFile */			["RamNameOfRecievedSendFile"],
		0x257:	/* RamIsSendingOrReceivingFileByBT */		["RamIsSendReceiveBT", "isSendReceiveFile", "RamIsSendReceiveFile"],
		0x263:	/* Obs_SetScaling */						["intObs_SetScaling"],
		0x26C:	/* Obs_Sound_SetVolumeEx */					["Obs_Sound_SetVolume", "Obs_SetVolumeEx"],
		0x26D:	/* Obs_Sound_GetVolume */					["Obs_GetVolume"],
		0x26E:	/* Obs_Sound_SetPurpose */					["Obs_SetPurpose"],
		0x27A:	/* Obs_SetInput_Memory */					["Obs_SetInputMemory"],
		0x284:	/* IsGPRSAvailable */						["IsGPRS"],
		0x285:	/* IsEDGEAvailable */						["IsEDGE", "RamIsEDGE"],
		0x288:	/* Audio_GetCurrAudioPath */				["GetCurrAudioPath"],
		0x28D:	/* RamBluetoothDeviceName */				["RamBTNameDevice", "GetBTNameDevice"],
		0x292:	/* RamIsAlarmClockAutorepeatOn */			["RamIsAlarmAutorepeatOn"],
		0x293:	/* RamAlarmClockHours */					["RamAlarmclockHour"],
		0x294:	/* RamAlarmClockMinutes */					["RamAlarmclockMinute"],
		0x296:	/* getProfileNameByN */						["getProfileNamervn"],
		0x297:	/* RamIsSoundRecordingActive */				["RamIsSoundRecord"],
		0x298:	/* RamSoundRecordingQuality */				["RamIsSoundRecordQuality"],
		0x29A:	/* AACC_AudioTransferReq */					["SwitchAudioToBTHeadset"],
		0x29B:	/* Audio_GetObjectHandle */					["GetTypeOfBTHeadset", "GetTypeOfHeadset"],
		0x2C4:	/* GetProfileVolumeSetting */				["GetPrfileVolumeSetting"],
		0x2D2:	/* StartNativeBrowserCore */				["StartBrowser"],
		0x2DB:	/* MediaSendCSM_Open */						["SendMedia"],
		0x350:	/* NU_Restore_Interrupts_2 */				["NU_Restore_Interrupts"],
		0x381:	/* CopyTextToClipboard */					["CopyWsToClipboard"],
		0x388:	/* LCDLAYER_Current_SetBufferDepth */		["SetDepthBuffer"],
		0x38A:	/* RamAudioHook */							["RamAudioHookProc", "RamPCMWAVStruct"],
		0x38D:	/* sys_fstat */								["stat"],
		0x38F:	/* GBS_CreateProcessGroupResource */		["CreatePGroupRes"],
		0x390:	/* GBS_GetCurrentTask */					["PGroupCurrentTaskPointer"],
		0x393:	/* RamMopiResourcePool */					["MopiResourcePool"],
	}
};
