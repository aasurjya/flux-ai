import { describe, it, expect } from "vitest";
import { generateBomCsv, parseBomCsv } from "./bom-csv";
import type { BomItem } from "@/types/project";

const bom: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3-WROOM-1", quantity: 1, package: "Module", status: "selected" },
  { id: "r1", designator: "R1-R2", name: "10k pull-up, 1%", quantity: 2, package: "0402", status: "selected" },
  { id: "c1", designator: "C1", name: "100nF, X7R", quantity: 1, package: "0402", status: "needs_review" }
];

describe("generateBomCsv", () => {
  it("emits a header row with standard KiCad-compatible columns", () => {
    const out = generateBomCsv(bom);
    const lines = out.split(/\r?\n/);
    expect(lines[0]).toBe("Reference,Value,Footprint,Quantity,Status");
  });

  it("emits one row per BOM item in order", () => {
    const out = generateBomCsv(bom);
    const lines = out.split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(bom.length + 1); // header + items
    expect(lines[1]).toBe("U1,ESP32-S3-WROOM-1,Module,1,selected");
    expect(lines[3]).toBe("C1,\"100nF, X7R\",0402,1,needs_review");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    const tricky: BomItem[] = [
      { id: "q1", designator: "Q1", name: 'He said "hi", OK', quantity: 1, package: "SOT-23", status: "selected" }
    ];
    const out = generateBomCsv(tricky);
    const line = out.split(/\r?\n/)[1];
    expect(line).toBe('Q1,"He said ""hi"", OK",SOT-23,1,selected');
  });

  it("round-trips via parseBomCsv", () => {
    const csv = generateBomCsv(bom);
    const parsed = parseBomCsv(csv);
    expect(parsed).toHaveLength(bom.length);
    expect(parsed[0]).toEqual({
      Reference: "U1",
      Value: "ESP32-S3-WROOM-1",
      Footprint: "Module",
      Quantity: "1",
      Status: "selected"
    });
    expect(parsed[2].Value).toBe("100nF, X7R");
  });

  it("throws on empty BOM (CSV with only a header is useless)", () => {
    expect(() => generateBomCsv([])).toThrow(/bom/i);
  });
});
