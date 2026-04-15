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

  it("names power nets semantically (VCC_3V3, VBUS) not by block id", () => {
    const out = generateNetlistXml({
      projectName: "x",
      bom: [
        { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" },
        { id: "u2", designator: "U2", name: "3V3 LDO", quantity: 1, package: "SOT-223", status: "selected" }
      ],
      architectureBlocks: [
        { id: "mcu", label: "ESP32-S3 MCU", kind: "processing", connections: ["3v3-rail"] },
        { id: "3v3-rail", label: "3.3V Rail", kind: "power", connections: ["mcu"] }
      ]
    });
    expect(out).toContain('name="/VCC_3V3"');
    expect(out).not.toContain("_mcu_3v3-rail"); // no block-id noise in net names
  });

  it("names bus nets semantically (I2C_BUS, SPI_BUS, SWD)", () => {
    const out = generateNetlistXml({
      projectName: "x",
      bom: [
        { id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "Module", status: "selected" },
        { id: "u2", designator: "U2", name: "IMU", quantity: 1, package: "LGA", status: "selected" }
      ],
      architectureBlocks: [
        { id: "mcu", label: "MCU", kind: "processing", connections: ["i2c-bus"] },
        { id: "i2c-bus", label: "I2C bus to IMU", kind: "interface", connections: ["mcu"] }
      ]
    });
    expect(out).toContain('name="/I2C_BUS"');
  });

  it("merges multiple edges that land on the same semantic net", () => {
    const out = generateNetlistXml({
      projectName: "x",
      bom: [
        { id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "Module", status: "selected" },
        { id: "u2", designator: "U2", name: "Sensor", quantity: 1, package: "LGA", status: "selected" },
        { id: "u3", designator: "U3", name: "LDO", quantity: 1, package: "SOT-223", status: "selected" }
      ],
      architectureBlocks: [
        { id: "mcu", label: "MCU", kind: "processing", connections: ["3v3"] },
        { id: "sens", label: "Sensor", kind: "sensor", connections: ["3v3"] },
        { id: "3v3", label: "3V3 Rail", kind: "power", connections: ["mcu", "sens"] }
      ]
    });
    // 3V3 powers both MCU (VCC_3V3) and sensor (VCC_SENSOR) — 2 distinct nets
    expect(out).toContain('"/VCC_3V3"');
    expect(out).toContain('"/VCC_SENSOR"');
  });

  it("uses differentiated pin numbers instead of pin=1 on both ends", () => {
    const out = generateNetlistXml({
      projectName: "x",
      bom: [
        { id: "u1", designator: "U1", name: "MCU", quantity: 1, package: "Module", status: "selected" },
        { id: "u2", designator: "U2", name: "LDO", quantity: 1, package: "SOT-223", status: "selected" }
      ],
      architectureBlocks: [
        { id: "mcu", label: "MCU", kind: "processing", connections: ["3v3"] },
        { id: "3v3", label: "3V3 Rail", kind: "power", connections: ["mcu"] }
      ]
    });
    // Processing endpoint on signal side = pin 2; power side = pin 1
    expect(out).toMatch(/pin="1"[^\n]*\n[^\n]*pin="2"|pin="2"[^\n]*\n[^\n]*pin="1"/);
  });

  it("throws on empty BOM", () => {
    expect(() =>
      generateNetlistXml({ projectName: "x", bom: [], architectureBlocks: blocks })
    ).toThrow(/bom/i);
  });
});
