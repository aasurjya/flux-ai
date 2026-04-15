import { describe, it, expect, vi } from "vitest";
import { validateDesign } from "./validate";
import type { AiClient } from "./client";
import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

function mockClient(callStructured: ReturnType<typeof vi.fn>): AiClient {
  return { callText: vi.fn(), callStructured } as unknown as AiClient;
}

const blocks: CircuitBlock[] = [
  { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3"] },
  { id: "3v3", label: "3.3V rail", kind: "power", connections: ["mcu"] }
];
const bom: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3-WROOM-1", quantity: 1, package: "Module", status: "selected" }
];
const sample: ValidationIssue[] = [
  { id: "v1", severity: "warning", title: "Power budget", detail: "Verify 3.3V headroom under peak load." },
  { id: "v2", severity: "info", title: "Add test pads", detail: "Add test pads for 3V3, GND, TX, RX before export." }
];

describe("validateDesign", () => {
  it("returns ValidationIssue[] from the structured response", async () => {
    const callStructured = vi.fn().mockResolvedValue({ issues: sample });
    const out = await validateDesign(mockClient(callStructured), {
      architectureBlocks: blocks,
      bom,
      constraints: [],
      requirements: ["r1"]
    });
    expect(out).toEqual(sample);
    expect(callStructured.mock.calls[0][0].schemaName).toBe("emit_validations");
  });

  it("assigns stable ids when omitted", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      issues: [
        { severity: "warning", title: "A", detail: "a" },
        { severity: "info", title: "B", detail: "b" }
      ]
    });
    const out = await validateDesign(mockClient(callStructured), {
      architectureBlocks: blocks,
      bom,
      constraints: [],
      requirements: ["r1"]
    });
    expect(out.map((v) => v.id)).toEqual(["val-1", "val-2"]);
  });

  it("dedupes issues by (severity, title)", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      issues: [
        { severity: "warning", title: "Power budget", detail: "first" },
        { severity: "warning", title: "Power budget", detail: "second dup" },
        { severity: "info", title: "Power budget", detail: "different severity keeps" }
      ]
    });
    const out = await validateDesign(mockClient(callStructured), {
      architectureBlocks: blocks,
      bom,
      constraints: [],
      requirements: ["r1"]
    });
    expect(out).toHaveLength(2);
    expect(out[0].detail).toBe("first");
  });

  it("allows an empty issues list (nothing to flag)", async () => {
    const callStructured = vi.fn().mockResolvedValue({ issues: [] });
    const out = await validateDesign(mockClient(callStructured), {
      architectureBlocks: blocks,
      bom,
      constraints: [],
      requirements: ["r1"]
    });
    expect(out).toEqual([]);
  });
});
