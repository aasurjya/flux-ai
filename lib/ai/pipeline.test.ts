import { describe, it, expect } from "vitest";
import { runGenerationPipeline } from "./pipeline";
import { createStubAiClient } from "./stub-client";

describe("runGenerationPipeline (with stub client)", () => {
  it("runs end-to-end when stub emits no clarifying questions", async () => {
    const result = await runGenerationPipeline(createStubAiClient(), {
      prompt: "USB-C powered MCU dev board",
      constraints: ["2-layer board"],
      preferredParts: []
    });

    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") return;
    expect(result.requirements.length).toBeGreaterThanOrEqual(2);
    expect(result.architectureBlocks.length).toBeGreaterThanOrEqual(2);
    expect(result.bom.length).toBeGreaterThanOrEqual(1);
    expect(result.validations.length).toBeGreaterThanOrEqual(0);
  });

  it("pauses at the clarify stage if the model emits questions and no answers are provided", async () => {
    const client = createStubAiClient();
    // Override: patch the stub to return questions for this test only
    const original = client.callStructured;
    client.callStructured = async (opts: Parameters<typeof original>[0]) => {
      if (opts.schemaName === "emit_clarifying_questions") {
        return opts.schema.parse({
          questions: ["Is the device battery-powered or wall-powered only?"]
        });
      }
      return original.call(client, opts);
    };

    const result = await runGenerationPipeline(client, {
      prompt: "sensor board",
      constraints: [],
      preferredParts: []
    });

    expect(result.kind).toBe("paused");
    if (result.kind !== "paused") return;
    expect(result.stage).toBe("clarify");
    expect(result.questions).toHaveLength(1);
  });

  it("skips the clarify stage when clarifyingAnswers are provided", async () => {
    const client = createStubAiClient();
    let clarifyCalled = false;
    const original = client.callStructured;
    client.callStructured = async (opts: Parameters<typeof original>[0]) => {
      if (opts.schemaName === "emit_clarifying_questions") clarifyCalled = true;
      return original.call(client, opts);
    };

    const result = await runGenerationPipeline(client, {
      prompt: "p",
      constraints: [],
      preferredParts: [],
      clarifyingAnswers: { "Q?": "A" }
    });

    expect(clarifyCalled).toBe(false);
    expect(result.kind).toBe("complete");
  });
});
