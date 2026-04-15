import { describe, it, expect } from "vitest";
import { generateSymbolLibrary } from "./symbol-gen";
import type { BomItem } from "@/types/project";

const bom: BomItem[] = [
  // Both entries are "custom" ICs — neither maps to a KiCad stdlib
  // symbol, so both must appear in the generated .kicad_sym file.
  // (passive R/C/L and USB-C connectors deliberately skip local lib
  // generation; they reference KiCad's shipped Device:/Connector: libs.
  // That behaviour is exercised in bundle tests + symbol-map tests.)
  { id: "u1", designator: "U1", name: "ESP32-S3-WROOM-1", quantity: 1, package: "Module", status: "selected" },
  { id: "u2", designator: "U2", name: "BQ24074 charger IC", quantity: 1, package: "QFN-20", status: "selected" }
];

describe("generateSymbolLibrary", () => {
  it("emits a valid kicad_symbol_lib header", () => {
    const out = generateSymbolLibrary("flux", bom);
    expect(out).toMatch(/^\(kicad_symbol_lib/);
    expect(out).toContain("(version 20231120)");
    expect(out).toContain("(generator flux_ai)");
  });

  it("emits one symbol per custom BOM item with reference/value properties", () => {
    const out = generateSymbolLibrary("flux", bom);
    expect(out).toContain('"flux:U1"');
    expect(out).toContain('"ESP32-S3-WROOM-1"');
    expect(out).toContain('"flux:U2"');
    expect(out).toContain('"BQ24074 charger IC"');
    expect((out.match(/"Reference"/g) ?? []).length).toBe(2);
    expect((out.match(/"Value"/g) ?? []).length).toBe(2);
  });

  it("includes a rectangle body for each custom symbol so it renders visibly", () => {
    const out = generateSymbolLibrary("flux", bom);
    const rectangleCount = (out.match(/\(rectangle/g) ?? []).length;
    expect(rectangleCount).toBe(2);
  });

  it("throws on empty BOM (no symbols to emit)", () => {
    expect(() => generateSymbolLibrary("flux", [])).toThrow(/bom/i);
  });

  it("includes a footprint property for each custom symbol", () => {
    const out = generateSymbolLibrary("flux", bom);
    const footprintCount = (out.match(/"Footprint"/g) ?? []).length;
    expect(footprintCount).toBe(2);
  });

  it("skips passives — R/C items are emitted only as stdlib references, not in the local lib", () => {
    const withPassives: BomItem[] = [
      ...bom,
      { id: "r1", designator: "R1", name: "10k 1%", quantity: 1, package: "0402", status: "selected" },
      { id: "c1", designator: "C1", name: "100nF X7R", quantity: 1, package: "0402", status: "selected" }
    ];
    const out = generateSymbolLibrary("flux", withPassives);
    expect(out).not.toContain('"flux:R1"');
    expect(out).not.toContain('"flux:C1"');
    // The two original ICs remain
    expect(out).toContain('"flux:U1"');
    expect(out).toContain('"flux:U2"');
  });
});
