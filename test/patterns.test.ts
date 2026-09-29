import { describe, expect, test } from "vitest";

import { parsePatterns, prettifyPatterns } from "../src/index.js";

const longCandidate = "BB,".repeat(50);
const source = `
[platforms]
ALL = ["NSG", "ELKA", "SG", "X75"]
NSG = ["NSG", "ELKA"]
SG = ["SG", "X75"]

[000]
decl = "void common()"
ALL = "common"

[001]
decl = "void inherited()"
ALL = "all"
NSG = "newsgold"
ELKA = "elka"

[002]
decl = "char **SettingsAE_GetEntryList(int set_id)"
decl_ELKA = "char **SettingsAE_GetEntryList_ELKA(int set_id)"
NSG = "enabled"
ELKA = false

[003]
decl = "void empty()"
ELKA = ""

[004]
decl = "void original()"
decl_NSG = "void inherited_decl()"
NSG = """
line one,
line two
"""

[005]
decl = "void original()"
decl_NSG = "void group_decl()"
decl_ELKA = "void platform_decl()"
NSG = "enabled"

[006]
decl = "void original()"
decl_SG = "void sg_decl()"
ALL = "enabled"

[007]
decl = "void original()"
decl_SG = "void sg_decl()"
decl_X75 = "void x75_decl()"
ALL = "enabled"

[009]
decl = "void candidates()"
NSG = [ "candidate1", "candidate2" ]

[00A]
decl = "void long_candidates()"
NSG = [ "short", "${longCandidate}" ]

[00B]
decl = "void disabled_candidates()"
NSG = [ "candidate1", "candidate2" ]
ELKA = false
`;

describe("patterns.toml", () => {
	test("resolves pattern inheritance and platform overrides", () => {
		const nsg = parsePatterns(source, "NSG");
		expect(nsg[0]?.pattern).toBe("common");
		expect(nsg[1]?.pattern).toBe("newsgold");
		expect(nsg[2]?.symbol).toBe("SettingsAE_GetEntryList");

		const elka = parsePatterns(Buffer.from(source), "ELKA");
		expect(elka[1]?.pattern).toBe("elka");
		expect(elka[2]).toBeUndefined();
		expect(elka[3]?.pattern).toBeUndefined();
		expect(elka[4]?.name).toBe("void inherited_decl()");
		expect(elka[4]?.symbol).toBe("inherited_decl");
		expect(elka[4]?.pattern).toBe("line one,line two");
		expect(elka[5]?.name).toBe("void platform_decl()");
		expect(elka[9]?.pattern).toEqual(["candidate1", "candidate2"]);
		expect(elka[10]?.pattern).toEqual(["short", longCandidate]);
		expect(elka[11]).toBeUndefined();
		expect(nsg[11]?.pattern).toEqual(["candidate1", "candidate2"]);

		const sg = parsePatterns(source, "SG");
		expect(sg[6]?.name).toBe("void sg_decl()");
		expect(sg[7]?.name).toBe("void sg_decl()");

		const x75 = parsePatterns(source, "X75");
		expect(x75[6]?.name).toBe("void sg_decl()");
		expect(x75[7]?.name).toBe("void x75_decl()");
	});

	test("rejects unknown platforms", () => {
		expect(() => parsePatterns(source, "UNKNOWN")).toThrow(/Unknown patterns platform/);
	});

	test("formats TOML without changing resolved patterns", () => {
		const longSource = `${source}\n[008]\ndecl = "void long_pattern()"\nNSG = "${"AA,".repeat(50)}"\n`;
		const formatted = prettifyPatterns(longSource);
		expect(formatted).toMatch(/NSG = """\n.{108}\n/);
		expect(formatted).toMatch(/NSG = \[\n\t"short",\n\t"""\n.{108}\n/);
		expect(formatted.indexOf("[platforms]")).toBeLessThan(formatted.indexOf("[000]"));
		expect(formatted.indexOf("[000]")).toBeLessThan(formatted.indexOf("[008]"));

		for (const platform of ["NSG", "ELKA", "SG", "X75"])
			expect(parsePatterns(formatted, platform)).toEqual(parsePatterns(longSource, platform));
	});
});
