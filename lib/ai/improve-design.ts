import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AiClient } from "./client";
import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

/**
 * Ask Claude to propose targeted, minimal improvements to an existing
 * design — typically driven by outstanding validations. Returns the
 * next BOM (existing + additions - removals) and a human-readable
 * change list for the revision record.
 *
 * Scope deliberately narrow: BOM additions/removals. Architecture edits
 * are out of scope here — they'd cascade into netlist regeneration and
 * require a much bigger diff apparatus. Scoping to BOM lets us ship
 * something real that a user can verify without rewriting the pipeline.
 */

const BomAddSchema = z.object({
  designator: z.string().regex(/^[A-Z]+[0-9]+(-[0-9]+)?$/),
  name: z.string().min(2).max(120),
  package: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(999),
  status: z.enum(["selected", "alternate", "needs_review"]),
  rationale: z.string().min(4).max(300)
});

const BomRemoveSchema = z.object({
  designator: z.string().regex(/^[A-Z]+[0-9]+(-[0-9]+)?$/),
  rationale: z.string().min(4).max(300)
});

const ResponseSchema = z.object({
  summary: z.string().min(5).max(200),
  bomAdditions: z.array(BomAddSchema).max(8),
  bomRemovals: z.array(BomRemoveSchema).max(4)
});

export interface ImproveDesignInput {
  prompt: string;
  requirements: string[];
  architectureBlocks: CircuitBlock[];
  bom: BomItem[];
  validations: ValidationIssue[];
  constraints: string[];
}

export interface ImproveDesignResult {
  /** Short headline for the revision card (what this iteration focused on) */
  summary: string;
  /** BOM with additions appended and removals filtered out */
  nextBom: BomItem[];
  /** Per-change explanations — populate revision.changes */
  changes: string[];
}

const SYSTEM_PROMPT = `You are an experienced hardware engineer iterating on a PCB design.

Given the current state of a project (requirements, constraints, architecture, BOM) and a list of open validation issues, produce a SMALL, TARGETED set of BOM edits that address the most impactful issues.

Rules:
- Prefer fixing validation warnings/criticals over speculative additions.
- Every addition needs a concrete rationale that references a specific issue or requirement.
- Keep changes minimal — only edit what actually needs fixing. Three high-quality fixes beat ten speculative ones.
- Never invent a manufacturer part number you are not confident about. Use generic names (e.g. "100nF X7R ceramic") when unsure.
- Respect all constraints (layer count, SMD-only, cost ceiling).
- Use "needs_review" status for items where your suggestion depends on info the brief doesn't provide.

Emit the improvements via the propose_design_improvements tool.`;

function buildUserMessage(input: ImproveDesignInput): string {
  const lines: string[] = [
    "# Customer brief",
    input.prompt.trim(),
    "",
    "# Constraints",
    input.constraints.length > 0 ? input.constraints.map((c) => `- ${c}`).join("\n") : "(none)",
    "",
    "# Requirements",
    input.requirements.map((r) => `- ${r}`).join("\n"),
    "",
    "# Current architecture",
    input.architectureBlocks
      .map((b) => `- ${b.label} (${b.kind}, id=${b.id}) → ${b.connections.join(", ") || "(no connections)"}`)
      .join("\n"),
    "",
    "# Current BOM",
    input.bom
      .map((b) => `- ${b.designator}: ${b.name} (${b.package}, qty ${b.quantity}, ${b.status})`)
      .join("\n"),
    "",
    "# Open validation issues"
  ];
  if (input.validations.length === 0) {
    lines.push("(none currently flagged)");
  } else {
    for (const issue of input.validations) {
      lines.push(`- [${issue.severity}] ${issue.title}: ${issue.detail}`);
    }
  }
  lines.push("", "Propose improvements via the propose_design_improvements tool.");
  return lines.join("\n");
}

function applyBomEdits(
  currentBom: BomItem[],
  additions: z.infer<typeof BomAddSchema>[],
  removals: z.infer<typeof BomRemoveSchema>[]
): { nextBom: BomItem[]; changes: string[] } {
  const changes: string[] = [];

  // Remove first so a re-add with the same designator is valid
  const removalDesignators = new Set(removals.map((r) => r.designator));
  const afterRemoval = currentBom.filter((item) => !removalDesignators.has(item.designator));
  for (const r of removals) {
    if (currentBom.some((b) => b.designator === r.designator)) {
      changes.push(`Removed ${r.designator}: ${r.rationale}`);
    }
  }

  const existingDesignators = new Set(afterRemoval.map((b) => b.designator));
  const additionsToApply: BomItem[] = [];
  for (const add of additions) {
    if (existingDesignators.has(add.designator)) {
      // Collision — skip. The LLM shouldn't re-add a designator; ignore
      // rather than silently overwrite the original.
      continue;
    }
    existingDesignators.add(add.designator);
    additionsToApply.push({
      id: `bom-${add.designator.toLowerCase()}-${randomUUID().slice(0, 6)}`,
      designator: add.designator,
      name: add.name,
      quantity: add.quantity,
      package: add.package,
      status: add.status
    });
    changes.push(`Added ${add.designator} (${add.name}): ${add.rationale}`);
  }

  return { nextBom: [...afterRemoval, ...additionsToApply], changes };
}

export async function improveDesign(
  client: AiClient,
  input: ImproveDesignInput
): Promise<ImproveDesignResult> {
  if (input.architectureBlocks.length === 0) {
    throw new Error("improveDesign: architectureBlocks must be non-empty — run Generate design first");
  }

  const response = await client.callStructured({
    system: SYSTEM_PROMPT,
    user: buildUserMessage(input),
    schema: ResponseSchema,
    schemaName: "propose_design_improvements",
    schemaDescription:
      "Propose minimal, targeted BOM edits (additions/removals) that resolve open validation issues or unmet requirements."
  });

  const { nextBom, changes } = applyBomEdits(
    input.bom,
    response.bomAdditions,
    response.bomRemovals
  );

  return {
    summary: response.summary,
    nextBom,
    changes: changes.length > 0 ? changes : ["(No BOM edits applied from this iteration.)"]
  };
}
