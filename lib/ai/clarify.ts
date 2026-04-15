import { z } from "zod";
import type { AiClient } from "./client";
import { CLARIFY_SYSTEM } from "./prompts";

export interface ClarifyInput {
  prompt: string;
  constraints: string[];
  requirements: string[];
}

const MAX_QUESTIONS = 3;

const ResponseSchema = z.object({
  questions: z.array(z.string().min(10)).max(6) // model may over-emit; we'll cap after
});

function buildUserMessage(input: ClarifyInput): string {
  const constraints = input.constraints.length > 0
    ? input.constraints.map((c) => `- ${c}`).join("\n")
    : "(none specified)";
  const requirements = input.requirements.map((r) => `- ${r}`).join("\n");
  return [
    "# Customer brief",
    input.prompt.trim(),
    "",
    "# Constraints",
    constraints,
    "",
    "# Extracted requirements",
    requirements,
    "",
    "Emit clarifying questions via the emit_clarifying_questions tool. Return an empty list if none are needed."
  ].join("\n");
}

function normalize(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

export async function clarifyRequirements(
  client: AiClient,
  input: ClarifyInput
): Promise<string[]> {
  if (input.requirements.length === 0) {
    throw new Error("clarifyRequirements: requirements list must be non-empty");
  }

  const response = await client.callStructured({
    system: CLARIFY_SYSTEM,
    user: buildUserMessage(input),
    schema: ResponseSchema,
    schemaName: "emit_clarifying_questions",
    schemaDescription:
      "Emit 0-3 clarifying questions that, if answered, would materially change the BOM or topology. Empty list if none needed."
  });

  return normalize(response.questions);
}
