import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createStubAiClient } from "./stub-client";
import { AiClientError } from "./client";

describe("createStubAiClient", () => {
  it("callText returns a non-empty placeholder string", async () => {
    const client = createStubAiClient();
    const out = await client.callText({ system: "s", user: "u" });
    expect(out.length).toBeGreaterThan(0);
  });

  it("callStructured returns canned response for known schema names", async () => {
    const client = createStubAiClient();
    const out = await client.callStructured({
      system: "s",
      user: "u",
      schema: z.object({
        requirements: z.array(z.string()).min(1)
      }),
      schemaName: "emit_requirements",
      schemaDescription: ""
    });
    expect(Array.isArray(out.requirements)).toBe(true);
    expect(out.requirements.length).toBeGreaterThan(0);
  });

  it("callStructured throws AiClientError for unknown schema name", async () => {
    const client = createStubAiClient();
    await expect(
      client.callStructured({
        system: "s",
        user: "u",
        schema: z.object({ x: z.string() }),
        schemaName: "emit_unknown_thing",
        schemaDescription: ""
      })
    ).rejects.toBeInstanceOf(AiClientError);
  });
});
