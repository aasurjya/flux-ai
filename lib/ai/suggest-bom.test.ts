import { describe, it, expect, vi } from "vitest";
import { suggestBom } from "./suggest-bom";
import type { AiClient } from "./client";
import type { BomItem, CircuitBlock } from "@/types/project";

function mockClient(callStructured: ReturnType<typeof vi.fn>): AiClient {
  return { callText: vi.fn(), callStructured } as unknown as AiClient;
}

const blocks: CircuitBlock[] = [
  { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3"] },
  { id: "3v3", label: "3.3V rail", kind: "power", connections: ["mcu", "imu"] },
  { id: "imu", label: "IMU", kind: "sensor", connections: ["3v3"] }
];

const sample: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3-WROOM-1", quantity: 1, package: "Module", status: "selected" },
  { id: "u2", designator: "U2", name: "LDO 3.3V 500mA", quantity: 1, package: "SOT-23-5", status: "selected" },
  { id: "u3", designator: "U3", name: "ICM-42688-P", quantity: 1, package: "LGA-14", status: "needs_review" }
];

describe("suggestBom", () => {
  it("returns BomItem[] from the structured LLM response", async () => {
    const callStructured = vi.fn().mockResolvedValue({ items: sample });
    const out = await suggestBom(mockClient(callStructured), {
      architectureBlocks: blocks,
      constraints: []
    });
    expect(out).toEqual(sample);
    const call = callStructured.mock.calls[0][0];
    expect(call.schemaName).toBe("emit_bom");
    // architecture summary should appear in the user message
    expect(call.user).toContain("ESP32-S3");
    expect(call.user).toContain("3.3V rail");
  });

  it("assigns stable ids when the LLM omits them", async () => {
    const withoutIds = sample.map(({ id: _, ...rest }) => rest);
    const callStructured = vi.fn().mockResolvedValue({ items: withoutIds });
    const out = await suggestBom(mockClient(callStructured), {
      architectureBlocks: blocks,
      constraints: []
    });
    expect(out.map((i) => i.id)).toEqual(["bom-u1", "bom-u2", "bom-u3"]);
  });

  it("deduplicates designators (keeps first occurrence)", async () => {
    const dup: BomItem[] = [
      { id: "a", designator: "U1", name: "First", quantity: 1, package: "P", status: "selected" },
      { id: "b", designator: "U1", name: "Dup", quantity: 1, package: "P", status: "selected" },
      { id: "c", designator: "U2", name: "Second", quantity: 1, package: "P", status: "selected" }
    ];
    const callStructured = vi.fn().mockResolvedValue({ items: dup });
    const out = await suggestBom(mockClient(callStructured), {
      architectureBlocks: blocks,
      constraints: []
    });
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("First");
  });

  it("throws when architectureBlocks is empty", async () => {
    await expect(
      suggestBom(mockClient(vi.fn()), { architectureBlocks: [], constraints: [] })
    ).rejects.toThrow(/architecture/i);
  });

  it("includes preferred parts and constraints in the user message", async () => {
    const callStructured = vi.fn().mockResolvedValue({ items: sample });
    await suggestBom(mockClient(callStructured), {
      architectureBlocks: blocks,
      constraints: ["SMD only", "Low-cost BOM"],
      preferredParts: ["BQ24074"]
    });
    const user = callStructured.mock.calls[0][0].user;
    expect(user).toContain("SMD only");
    expect(user).toContain("Low-cost BOM");
    expect(user).toContain("BQ24074");
  });
});
