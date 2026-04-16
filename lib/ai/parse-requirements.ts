import { z } from "zod";
import type { AiClient } from "./client";
import { PARSE_REQUIREMENTS_SYSTEM } from "./prompts";
import { buildUserMessage } from "./build-user-message";

export class ParseRequirementsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseRequirementsInputError";
  }
}

export interface ParseRequirementsInput {
  prompt: string;
  constraints: string[];
  preferredParts?: string[];
}

const ResponseSchema = z.object({
  requirements: z.array(z.string().min(8)).min(1).max(12)
});

function formatUserMessage(input: ParseRequirementsInput): string {
  const sections = [
    { title: "Customer brief", text: input.prompt },
    { title: "Constraints", items: input.constraints, emptyLabel: "(none specified)" },
    ...(input.preferredParts && input.preferredParts.length > 0
      ? [{ title: "Preferred parts", items: input.preferredParts }]
      : [])
  ];
  return buildUserMessage({
    sections,
    instruction: "Emit the requirements list via the emit_requirements tool."
  });
}

function normalizeRequirements(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export async function parseRequirements(
  client: AiClient,
  input: ParseRequirementsInput
): Promise<string[]> {
  if (!input.prompt || input.prompt.trim().length === 0) {
    throw new ParseRequirementsInputError("prompt is required");
  }

  const response = await client.callStructured({
    system: PARSE_REQUIREMENTS_SYSTEM,
    user: formatUserMessage(input),
    schema: ResponseSchema,
    schemaName: "emit_requirements",
    schemaDescription:
      "Emit 4-8 concrete, testable hardware-design requirements extracted from the brief and constraints."
  });

  return normalizeRequirements(response.requirements);
}
