import { z } from "zod";
import type { AiClient } from "./client";
import { PARSE_REQUIREMENTS_SYSTEM } from "./prompts";

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

function buildUserMessage(input: ParseRequirementsInput): string {
  const lines: string[] = [
    "# Customer brief",
    input.prompt.trim(),
    "",
    "# Constraints",
    input.constraints.length > 0 ? input.constraints.map((c) => `- ${c}`).join("\n") : "(none specified)"
  ];
  if (input.preferredParts && input.preferredParts.length > 0) {
    lines.push("", "# Preferred parts", input.preferredParts.map((p) => `- ${p}`).join("\n"));
  }
  lines.push("", "Emit the requirements list via the emit_requirements tool.");
  return lines.join("\n");
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
    user: buildUserMessage(input),
    schema: ResponseSchema,
    schemaName: "emit_requirements",
    schemaDescription:
      "Emit 4-8 concrete, testable hardware-design requirements extracted from the brief and constraints."
  });

  return normalizeRequirements(response.requirements);
}
