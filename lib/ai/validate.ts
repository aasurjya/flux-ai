import { z } from "zod";
import type { AiClient } from "./client";
import { VALIDATE_SYSTEM } from "./prompts";
import { buildUserMessage } from "./build-user-message";
import { architectureSummary } from "./generate-architecture";
import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

const IssueSchema = z.object({
  id: z.string().optional(), // we assign val-N if omitted
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().min(3).max(100),
  detail: z.string().min(3).max(600)
});

const ResponseSchema = z.object({
  issues: z.array(IssueSchema).min(0).max(12)
});

export interface ValidateDesignInput {
  architectureBlocks: CircuitBlock[];
  bom: BomItem[];
  constraints: string[];
  requirements: string[];
}

function formatUserMessage(input: ValidateDesignInput): string {
  const bomLines = input.bom
    .map((b) => `${b.designator}: ${b.name} (${b.package}, qty ${b.quantity}, ${b.status})`);
  return buildUserMessage({
    sections: [
      { title: "Requirements", items: input.requirements },
      { title: "Constraints", items: input.constraints, emptyLabel: "(none specified)" },
      { title: "Architecture", items: architectureSummary(input.architectureBlocks) },
      { title: "Proposed BOM", items: bomLines }
    ],
    instruction: "Emit validation issues via the emit_validations tool. Prefer 2-6 specific, actionable items. Empty list if nothing is risky."
  });
}

function normalize(issues: z.infer<typeof IssueSchema>[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  let counter = 1;
  for (const raw of issues) {
    const key = `${raw.severity}::${raw.title.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: raw.id?.trim() || `val-${counter}`,
      severity: raw.severity,
      title: raw.title.trim(),
      detail: raw.detail.trim()
    });
    counter += 1;
  }
  return out;
}

export async function validateDesign(
  client: AiClient,
  input: ValidateDesignInput
): Promise<ValidationIssue[]> {
  const response = await client.callStructured({
    system: VALIDATE_SYSTEM,
    user: formatUserMessage(input),
    schema: ResponseSchema,
    schemaName: "emit_validations",
    schemaDescription:
      "Cross-check the proposed architecture + BOM against the requirements and constraints. Emit 0-12 specific, actionable validation issues."
  });
  return normalize(response.issues);
}
