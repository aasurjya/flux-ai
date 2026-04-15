import { z } from "zod";
import type { AiClient } from "./client";
import { VALIDATE_SYSTEM } from "./prompts";
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

function buildUserMessage(input: ValidateDesignInput): string {
  return [
    "# Requirements",
    input.requirements.map((r) => `- ${r}`).join("\n"),
    "",
    "# Constraints",
    input.constraints.length > 0 ? input.constraints.map((c) => `- ${c}`).join("\n") : "(none specified)",
    "",
    "# Architecture",
    ...architectureSummary(input.architectureBlocks).map((line) => `- ${line}`),
    "",
    "# Proposed BOM",
    input.bom.map((b) => `- ${b.designator}: ${b.name} (${b.package}, qty ${b.quantity}, ${b.status})`).join("\n"),
    "",
    "Emit validation issues via the emit_validations tool. Prefer 2-6 specific, actionable items. Empty list if nothing is risky."
  ].join("\n");
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
    user: buildUserMessage(input),
    schema: ResponseSchema,
    schemaName: "emit_validations",
    schemaDescription:
      "Cross-check the proposed architecture + BOM against the requirements and constraints. Emit 0-12 specific, actionable validation issues."
  });
  return normalize(response.issues);
}
