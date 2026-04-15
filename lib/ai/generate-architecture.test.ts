import { describe, it, expect, vi } from "vitest";
import { generateArchitecture, architectureSummary } from "./generate-architecture";
import type { AiClient } from "./client";
import type { CircuitBlock } from "@/types/project";

function mockClient(callStructured: ReturnType<typeof vi.fn>): AiClient {
  return { callText: vi.fn(), callStructured } as unknown as AiClient;
}

describe("generateArchitecture", () => {
  const validBlocks: CircuitBlock[] = [
    { id: "usb-in", label: "USB-C input", kind: "interface", connections: ["pwr-prot"] },
    { id: "pwr-prot", label: "Input protection", kind: "protection", connections: ["usb-in", "3v3-reg"] },
    { id: "3v3-reg", label: "3.3V LDO", kind: "power", connections: ["pwr-prot", "mcu"] },
    { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3-reg", "imu"] },
    { id: "imu", label: "ICM-42688-P", kind: "sensor", connections: ["mcu"] }
  ];

  it("returns CircuitBlock[] when LLM emits valid graph", async () => {
    const callStructured = vi.fn().mockResolvedValue({ blocks: validBlocks });
    const out = await generateArchitecture(mockClient(callStructured), {
      prompt: "battery-powered sensor",
      constraints: [],
      requirements: ["3.3V rail", "USB-C"]
    });
    expect(out).toEqual(validBlocks);
  });

  it("filters connections that reference nonexistent block ids", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      blocks: [
        { id: "a", label: "A", kind: "power", connections: ["b", "c-does-not-exist"] },
        { id: "b", label: "B", kind: "processing", connections: ["a"] }
      ]
    });
    const out = await generateArchitecture(mockClient(callStructured), {
      prompt: "p",
      constraints: [],
      requirements: ["r"]
    });
    expect(out[0].connections).toEqual(["b"]); // dropped the dangling id
  });

  it("deduplicates block ids (keeps first occurrence)", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      blocks: [
        { id: "a", label: "First A", kind: "power", connections: ["b"] },
        { id: "a", label: "Dup A", kind: "power", connections: [] },
        { id: "b", label: "B", kind: "processing", connections: ["a"] }
      ]
    });
    const out = await generateArchitecture(mockClient(callStructured), {
      prompt: "p",
      constraints: [],
      requirements: ["r"]
    });
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe("First A");
  });

  it("throws when requirements is empty (nothing to build from)", async () => {
    await expect(
      generateArchitecture(mockClient(vi.fn()), { prompt: "p", constraints: [], requirements: [] })
    ).rejects.toThrow(/requirements/i);
  });
});

describe("architectureSummary", () => {
  it("produces a short human-readable summary line per block", () => {
    const blocks: CircuitBlock[] = [
      { id: "pwr", label: "3V3 Rail", kind: "power", connections: ["mcu"] },
      { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["pwr", "imu"] },
      { id: "imu", label: "IMU", kind: "sensor", connections: ["mcu"] }
    ];
    const summary = architectureSummary(blocks);
    expect(summary).toEqual([
      "3V3 Rail — power, connects to: ESP32-S3",
      "ESP32-S3 — processing, connects to: 3V3 Rail, IMU",
      "IMU — sensor, connects to: ESP32-S3"
    ]);
  });
});
