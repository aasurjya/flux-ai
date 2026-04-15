import { describe, it, expect, vi } from "vitest";
import { parseRequirements, ParseRequirementsInputError } from "./parse-requirements";
import type { AiClient } from "./client";

function mockClient(overrides: Partial<AiClient> = {}): AiClient {
  return {
    callText: vi.fn(),
    callStructured: vi.fn(),
    ...overrides
  } as AiClient;
}

describe("parseRequirements", () => {
  it("returns the requirements array from a structured LLM response", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      requirements: [
        "Operate from a single-cell Li-ion battery between 3.0V and 4.2V.",
        "Provide a 3.3V rail for MCU and IMU.",
        "Expose USB-C with ESD protection."
      ]
    });
    const client = mockClient({ callStructured });

    const out = await parseRequirements(client, {
      prompt: "battery-powered ESP32 sensor board",
      constraints: ["2-layer board", "Low-cost BOM"]
    });

    expect(out).toEqual([
      "Operate from a single-cell Li-ion battery between 3.0V and 4.2V.",
      "Provide a 3.3V rail for MCU and IMU.",
      "Expose USB-C with ESD protection."
    ]);
    expect(callStructured).toHaveBeenCalledOnce();
    const call = callStructured.mock.calls[0][0];
    expect(call.system).toMatch(/hardware engineer/i);
    expect(call.user).toContain("battery-powered ESP32 sensor board");
    expect(call.user).toContain("2-layer board");
    expect(call.user).toContain("Low-cost BOM");
    expect(call.schemaName).toBe("emit_requirements");
  });

  it("trims and deduplicates requirements", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      requirements: [
        "  Provide a 3.3V rail  ",
        "Provide a 3.3V rail",
        "Expose USB-C."
      ]
    });
    const client = mockClient({ callStructured });

    const out = await parseRequirements(client, {
      prompt: "p",
      constraints: []
    });

    expect(out).toEqual(["Provide a 3.3V rail", "Expose USB-C."]);
  });

  it("rejects an empty prompt at the boundary (no LLM call)", async () => {
    const callStructured = vi.fn();
    const client = mockClient({ callStructured });

    await expect(
      parseRequirements(client, { prompt: "   ", constraints: [] })
    ).rejects.toBeInstanceOf(ParseRequirementsInputError);
    expect(callStructured).not.toHaveBeenCalled();
  });

  it("includes preferred parts in the user message when provided", async () => {
    const callStructured = vi.fn().mockResolvedValue({ requirements: ["a thing", "another thing"] });
    const client = mockClient({ callStructured });

    await parseRequirements(client, {
      prompt: "board",
      constraints: [],
      preferredParts: ["ESP32-S3", "BQ24074"]
    });

    const call = callStructured.mock.calls[0][0];
    expect(call.user).toContain("ESP32-S3");
    expect(call.user).toContain("BQ24074");
  });
});
