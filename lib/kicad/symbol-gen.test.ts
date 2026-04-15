import { describe, it, expect } from "vitest";
import { generateSymbolLibrary } from "./symbol-gen";
import type { BomItem } from "@/types/project";

const bom: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3-WROOM-1", quantity: 1, package: "Module", status: "selected" },
  { id: "j1", designator: "J1", name: "USB-C Connector", quantity: 1, package: "SMD", status: "selected" }
];

describe("generateSymbolLibrary", () => {
  it("emits a valid kicad_symbol_lib header", () => {
    const out = generateSymbolLibrary("flux", bom);
    expect(out).toMatch(/^\(kicad_symbol_lib/);
    expect(out).toContain("(version 20231120)");
    expect(out).toContain("(generator flux_ai)");
  });

  it("emits one symbol per BOM item with reference/value properties", () => {
    const out = generateSymbolLibrary("flux", bom);
    expect(out).toContain('"flux:U1"');
    expect(out).toContain('"ESP32-S3-WROOM-1"');
    expect(out).toContain('"flux:J1"');
    expect(out).toContain('"USB-C Connector"');
    // Every symbol must have Reference + Value properties
    expect((out.match(/"Reference"/g) ?? []).length).toBe(2);
    expect((out.match(/"Value"/g) ?? []).length).toBe(2);
  });

  it("includes a rectangle body for each symbol so it renders visibly", () => {
    const out = generateSymbolLibrary("flux", bom);
    // At least two rectangle draws (one per symbol)
    const rectangleCount = (out.match(/\(rectangle/g) ?? []).length;
    expect(rectangleCount).toBe(2);
  });

  it("throws on empty BOM (no symbols to emit)", () => {
    expect(() => generateSymbolLibrary("flux", [])).toThrow(/bom/i);
  });

  it("includes a reasonable footprint property derived from package", () => {
    const out = generateSymbolLibrary("flux", bom);
    // Footprint property exists for each item
    const footprintCount = (out.match(/"Footprint"/g) ?? []).length;
    expect(footprintCount).toBe(2);
  });
});
