import { describe, it, expect } from "vitest";
import { generateSchematic } from "./schematic-gen";
import type { BomItem, CircuitBlock } from "@/types/project";

const blocks: CircuitBlock[] = [
  { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3"] },
  { id: "3v3", label: "3.3V rail", kind: "power", connections: ["mcu"] }
];
const bom: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3-WROOM-1", quantity: 1, package: "Module", status: "selected" },
  { id: "u2", designator: "U2", name: "LDO 3.3V", quantity: 1, package: "SOT-223", status: "selected" }
];

describe("generateSchematic", () => {
  it("produces a well-formed kicad_sch header", () => {
    const out = generateSchematic({
      projectName: "Demo",
      libName: "flux",
      bom,
      architectureBlocks: blocks
    });
    expect(out).toMatch(/^\(kicad_sch/);
    expect(out).toContain("(version 20231120)");
    expect(out).toContain("(generator flux_ai)");
    expect(out).toContain('(paper "A4")');
  });

  it("embeds a title block with the project name and rev", () => {
    const out = generateSchematic({
      projectName: "My Board",
      libName: "flux",
      bom,
      architectureBlocks: blocks
    });
    expect(out).toContain('"My Board"');
    expect(out).toContain("(title_block");
    expect(out).toContain('(rev "1.0")');
  });

  it("includes lib_symbols section with each BOM symbol", () => {
    const out = generateSchematic({
      projectName: "Demo",
      libName: "flux",
      bom,
      architectureBlocks: blocks
    });
    expect(out).toContain("(lib_symbols");
    expect(out).toContain('"flux:U1"');
    expect(out).toContain('"flux:U2"');
  });

  it("places one symbol instance per BOM item with a unique position", () => {
    const out = generateSchematic({
      projectName: "Demo",
      libName: "flux",
      bom,
      architectureBlocks: blocks
    });
    // `(lib_id "..."` only appears inside placed symbol nodes
    const libIdCount = (out.match(/\(lib_id\s/g) ?? []).length;
    expect(libIdCount).toBe(bom.length);
    // Each placed symbol has a unique `(at X Y 0)` position on the grid
    const atPositions = (out.match(/\(at [\d.]+ [\d.]+ 0\)/g) ?? []).length;
    expect(atPositions).toBeGreaterThanOrEqual(bom.length);
  });

  it("appends a sheet_instances entry so KiCad recognises the sheet", () => {
    const out = generateSchematic({
      projectName: "Demo",
      libName: "flux",
      bom,
      architectureBlocks: blocks
    });
    expect(out).toContain("(sheet_instances");
    expect(out).toContain('(page "1")');
  });

  it("throws on empty BOM", () => {
    expect(() =>
      generateSchematic({ projectName: "x", libName: "flux", bom: [], architectureBlocks: blocks })
    ).toThrow(/bom/i);
  });
});
