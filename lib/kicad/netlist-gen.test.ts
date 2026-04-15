import { describe, it, expect } from "vitest";
import { generateNetlistXml } from "./netlist-gen";
import type { BomItem, CircuitBlock } from "@/types/project";

const bom: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" },
  { id: "u2", designator: "U2", name: "3.3V LDO", quantity: 1, package: "SOT-223", status: "selected" }
];
const blocks: CircuitBlock[] = [
  { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3"] },
  { id: "3v3", label: "3.3V rail", kind: "power", connections: ["mcu"] }
];

describe("generateNetlistXml", () => {
  it("produces a valid XML prolog", () => {
    const out = generateNetlistXml({ projectName: "Demo", bom, architectureBlocks: blocks });
    expect(out).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });

  it("includes an <export> root with version attribute", () => {
    const out = generateNetlistXml({ projectName: "Demo", bom, architectureBlocks: blocks });
    expect(out).toContain('<export version="E">');
    expect(out).toContain("</export>");
  });

  it("includes a <design> section with source + tool + date", () => {
    const out = generateNetlistXml({ projectName: "My Board", bom, architectureBlocks: blocks });
    expect(out).toContain("<design>");
    expect(out).toContain("<source>My Board.kicad_sch</source>");
    expect(out).toContain("<tool>flux.ai</tool>");
    expect(out).toMatch(/<date>\d{4}-\d{2}-\d{2}/);
  });

  it("emits a <comp> per BOM item with escaped XML special chars", () => {
    const withXml: BomItem[] = [
      { id: "x", designator: "X1", name: "10 Ω < 100mA & \"safe\"", quantity: 1, package: "0402", status: "selected" }
    ];
    const out = generateNetlistXml({ projectName: "x", bom: withXml, architectureBlocks: blocks });
    expect(out).toContain('<comp ref="X1">');
    expect(out).toContain("10 Ω &lt; 100mA &amp; &quot;safe&quot;");
  });

  it("emits one <net> per architecture connection pair (dedupe reverse)", () => {
    const out = generateNetlistXml({ projectName: "x", bom, architectureBlocks: blocks });
    // two blocks bidirectionally connected should produce exactly 1 net
    const netCount = (out.match(/<net\s/g) ?? []).length;
    expect(netCount).toBe(1);
  });

  it("throws on empty BOM", () => {
    expect(() =>
      generateNetlistXml({ projectName: "x", bom: [], architectureBlocks: blocks })
    ).toThrow(/bom/i);
  });
});
