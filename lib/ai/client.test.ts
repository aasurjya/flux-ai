import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createAiClient, AiClientError } from "./client";

// A minimal fake of the Anthropic SDK — exposes only the shape we use.
// We stub messages.create; each test sets .mockResolvedValueOnce(...) or
// .mockRejectedValueOnce(...) to drive behaviour.
function makeFakeSdk() {
  const create = vi.fn();
  const sdk = { messages: { create } } as unknown as Anthropic;
  return { sdk, create };
}

function textResponse(text: string) {
  return {
    id: "msg_1",
    type: "message" as const,
    role: "assistant" as const,
    model: "claude-sonnet-4-6",
    content: [{ type: "text" as const, text }],
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 }
  };
}

function toolResponse(name: string, input: unknown) {
  return {
    id: "msg_2",
    type: "message" as const,
    role: "assistant" as const,
    model: "claude-sonnet-4-6",
    content: [{ type: "tool_use" as const, id: "tu_1", name, input }],
    stop_reason: "tool_use" as const,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 }
  };
}

describe("createAiClient", () => {
  describe("callText", () => {
    it("returns assistant text for a plain-text response", async () => {
      const { sdk, create } = makeFakeSdk();
      create.mockResolvedValueOnce(textResponse("a clean 3.3V rail is required"));
      const client = createAiClient({ apiKey: "test", anthropic: sdk, maxRetries: 0 });

      const out = await client.callText({ system: "s", user: "u" });

      expect(out).toBe("a clean 3.3V rail is required");
      expect(create).toHaveBeenCalledOnce();
      const args = create.mock.calls[0][0];
      expect(args.system).toBe("s");
      expect(args.messages).toEqual([{ role: "user", content: "u" }]);
    });

    it("throws AiClientError on non-text response", async () => {
      const { sdk, create } = makeFakeSdk();
      create.mockResolvedValueOnce(toolResponse("x", {}));
      const client = createAiClient({ apiKey: "test", anthropic: sdk, maxRetries: 0 });

      await expect(client.callText({ system: "s", user: "u" })).rejects.toBeInstanceOf(AiClientError);
    });
  });

  describe("callStructured", () => {
    const Req = z.object({ items: z.array(z.string()).min(1) });

    it("validates tool_use input against the Zod schema", async () => {
      const { sdk, create } = makeFakeSdk();
      create.mockResolvedValueOnce(toolResponse("emit_requirements", { items: ["a", "b"] }));
      const client = createAiClient({ apiKey: "test", anthropic: sdk, maxRetries: 0 });

      const out = await client.callStructured({
        system: "s",
        user: "u",
        schema: Req,
        schemaName: "emit_requirements",
        schemaDescription: "Emit requirements"
      });

      expect(out).toEqual({ items: ["a", "b"] });
      const args = create.mock.calls[0][0];
      expect(args.tools).toHaveLength(1);
      expect(args.tools[0].name).toBe("emit_requirements");
      expect(args.tool_choice).toEqual({ type: "tool", name: "emit_requirements" });
    });

    it("throws AiClientError when schema validation fails", async () => {
      const { sdk, create } = makeFakeSdk();
      create.mockResolvedValueOnce(toolResponse("emit_requirements", { items: [] })); // empty, fails .min(1)
      const client = createAiClient({ apiKey: "test", anthropic: sdk, maxRetries: 0 });

      await expect(
        client.callStructured({
          system: "s",
          user: "u",
          schema: Req,
          schemaName: "emit_requirements",
          schemaDescription: "Emit requirements"
        })
      ).rejects.toBeInstanceOf(AiClientError);
    });
  });

  describe("retry policy", () => {
    const makeApiError = <E extends Anthropic.APIError>(
      Ctor: new (status: number, error: unknown, message: string, headers: Headers | undefined) => E,
      status: number,
      type: string,
      message: string
    ): E => new Ctor(status, { error: { type, message } }, message, new Headers());

    it("retries on RateLimitError up to maxRetries then succeeds", async () => {
      const { sdk, create } = makeFakeSdk();
      const rate = makeApiError(Anthropic.RateLimitError, 429, "rate_limit_error", "rate");
      create.mockRejectedValueOnce(rate).mockResolvedValueOnce(textResponse("ok"));
      const client = createAiClient({ apiKey: "test", anthropic: sdk, maxRetries: 2, baseDelayMs: 1 });

      const out = await client.callText({ system: "s", user: "u" });

      expect(out).toBe("ok");
      expect(create).toHaveBeenCalledTimes(2);
    });

    it("does not retry on BadRequestError", async () => {
      const { sdk, create } = makeFakeSdk();
      const bad = makeApiError(Anthropic.BadRequestError, 400, "invalid_request_error", "bad");
      create.mockRejectedValueOnce(bad);
      const client = createAiClient({ apiKey: "test", anthropic: sdk, maxRetries: 3, baseDelayMs: 1 });

      await expect(client.callText({ system: "s", user: "u" })).rejects.toBeInstanceOf(Anthropic.BadRequestError);
      expect(create).toHaveBeenCalledOnce();
    });

    it("retries on InternalServerError and eventually throws after exhausting retries", async () => {
      const { sdk, create } = makeFakeSdk();
      const ise = makeApiError(Anthropic.InternalServerError, 500, "api_error", "ise");
      create.mockRejectedValue(ise);
      const client = createAiClient({ apiKey: "test", anthropic: sdk, maxRetries: 2, baseDelayMs: 1 });

      await expect(client.callText({ system: "s", user: "u" })).rejects.toBeInstanceOf(Anthropic.InternalServerError);
      expect(create).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe("factory safety", () => {
    it("throws if no apiKey and no injected sdk", () => {
      const prev = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        expect(() => createAiClient()).toThrow(/ANTHROPIC_API_KEY/);
      } finally {
        if (prev) process.env.ANTHROPIC_API_KEY = prev;
      }
    });

    it("accepts an injected Anthropic instance without an apiKey", () => {
      const { sdk } = makeFakeSdk();
      expect(() => createAiClient({ anthropic: sdk })).not.toThrow();
    });
  });
});
