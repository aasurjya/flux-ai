import { describe, it, expect, vi } from "vitest";
import { clarifyRequirements } from "./clarify";
import type { AiClient } from "./client";

function mockClient(callStructured: ReturnType<typeof vi.fn>): AiClient {
  return { callText: vi.fn(), callStructured } as unknown as AiClient;
}

describe("clarifyRequirements", () => {
  it("returns questions when the model emits them", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      questions: [
        "What is the target battery capacity and expected runtime?",
        "Should the 5V rail survive USB reverse polarity?"
      ]
    });

    const out = await clarifyRequirements(mockClient(callStructured), {
      prompt: "battery-powered sensor board",
      constraints: [],
      requirements: ["Operate from single-cell Li-ion", "Expose USB-C"]
    });

    expect(out).toHaveLength(2);
    const call = callStructured.mock.calls[0][0];
    expect(call.schemaName).toBe("emit_clarifying_questions");
    expect(call.user).toContain("battery-powered sensor board");
    expect(call.user).toContain("Operate from single-cell Li-ion");
  });

  it("returns an empty array when the model emits no questions", async () => {
    const callStructured = vi.fn().mockResolvedValue({ questions: [] });
    const out = await clarifyRequirements(mockClient(callStructured), {
      prompt: "p",
      constraints: [],
      requirements: ["r1", "r2"]
    });
    expect(out).toEqual([]);
  });

  it("trims and deduplicates questions, caps at 3", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      questions: [
        "  What is the target runtime?",
        "What is the target runtime?",
        "What cost ceiling?",
        "Any certification targets?",
        "Should it survive drops?"
      ]
    });
    const out = await clarifyRequirements(mockClient(callStructured), {
      prompt: "p",
      constraints: [],
      requirements: ["r1"]
    });
    expect(out).toEqual([
      "What is the target runtime?",
      "What cost ceiling?",
      "Any certification targets?"
    ]);
  });

  it("throws if called with empty requirements (nothing to clarify about)", async () => {
    const callStructured = vi.fn();
    await expect(
      clarifyRequirements(mockClient(callStructured), {
        prompt: "p",
        constraints: [],
        requirements: []
      })
    ).rejects.toThrow(/requirements/i);
    expect(callStructured).not.toHaveBeenCalled();
  });
});
