import { loadSwilibConfig } from "./config.js";
import { parseSwilibPatch } from "#src/swilib/parse.js";
import fs from "node:fs";
import { analyzeSwilib } from "#src/swilib/analyze.js";
import { parseLibraryFromSDK } from "#src/sdklib/parse.js";
import { getDataTypesHeader } from "#src/sdklib/disassembler.js";

//const swilibConfig = loadSwilibConfig("../../sdk");
// const swilib = parseSwilibPatch(swilibConfig, fs.readFileSync("/tmp/swilib_v040326.vkp", "utf-8"));
//const sdklib = await parseLibraryFromSDK("../../sdk", "ELKA");

// console.log(analyzeSwilib(swilibConfig, swilib, sdklib));

const header = await getDataTypesHeader("../../sdk", "ELKA");
console.log(header);
