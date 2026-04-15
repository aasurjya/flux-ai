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
    // `(lib_id "..."` appears in placed symbols (BOM items) AND in
    // power symbols for power-kind blocks. Minimum = bom.length.
    const libIdCount = (out.match(/\(lib_id\s/g) ?? []).length;
    expect(libIdCount).toBeGreaterThanOrEqual(bom.length);
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

  it("emits global_label nodes for every unique edge, one per endpoint", () => {
    const out = generateSchematic({
      projectName: "Nets",
      libName: "flux",
      bom: [
        { id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "QFN", status: "selected" },
        { id: "u2", designator: "U2", name: "LDO", quantity: 1, package: "SOT-223", status: "selected" }
      ],
      architectureBlocks: [
        { id: "mcu", label: "MCU", kind: "processing", connections: ["3v3"] },
        { id: "3v3", label: "3V3 Rail", kind: "power", connections: ["mcu"] }
      ]
    });
    // 1 unique edge → 2 global_label nodes (one per endpoint)
    const labelCount = (out.match(/\(global_label\s/g) ?? []).length;
    expect(labelCount).toBe(2);
    // The label text reuses netNameFor's output (VCC_3V3 for power↔processing + 3v3 label)
    expect(out).toContain("\"VCC_3V3\"");
  });

  it("uses KiCad stdlib power symbols for power-kind blocks", () => {
    const out = generateSchematic({
      projectName: "Pwr",
      libName: "flux",
      bom: [
        { id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "QFN", status: "selected" }
      ],
      architectureBlocks: [
        { id: "mcu", label: "MCU", kind: "processing", connections: ["3v3"] },
        { id: "3v3", label: "3V3 Rail", kind: "power", connections: ["mcu"] }
      ]
    });
    // A +3V3 power symbol must appear somewhere in the placed symbols section
    expect(out).toContain("power:+3V3");
  });

  it("picks the right power symbol based on rail voltage", () => {
    const blocks5v: CircuitBlock[] = [
      { id: "mcu", label: "MCU", kind: "processing", connections: ["5v"] },
      { id: "5v", label: "5V Rail", kind: "power", connections: ["mcu"] }
    ];
    const out5v = generateSchematic({
      projectName: "x",
      libName: "flux",
      bom: [{ id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "QFN", status: "selected" }],
      architectureBlocks: blocks5v
    });
    expect(out5v).toContain("power:+5V");

    const blocksVbus: CircuitBlock[] = [
      { id: "usb", label: "USB-C Input", kind: "interface", connections: ["vin"] },
      { id: "vin", label: "VBUS Input", kind: "power", connections: ["usb"] }
    ];
    const outVbus = generateSchematic({
      projectName: "x",
      libName: "flux",
      bom: [{ id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "QFN", status: "selected" }],
      architectureBlocks: blocksVbus
    });
    expect(outVbus).toContain("power:VBUS");
  });

  it("does not emit power symbols when no power-kind block exists", () => {
    const out = generateSchematic({
      projectName: "No Power",
      libName: "flux",
      bom: [{ id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "QFN", status: "selected" }],
      architectureBlocks: [
        { id: "mcu", label: "MCU", kind: "processing", connections: [] }
      ]
    });
    expect(out).not.toContain("power:");
  });

  it("does not emit net labels for an architecture with no connections", () => {
    const out = generateSchematic({
      projectName: "Isolated",
      libName: "flux",
      bom: [{ id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "QFN", status: "selected" }],
      architectureBlocks: [
        { id: "mcu", label: "MCU", kind: "processing", connections: [] }
      ]
    });
    expect(out).not.toContain("global_label");
  });
});
