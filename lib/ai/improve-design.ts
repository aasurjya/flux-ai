import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AiClient } from "./client";
import { buildUserMessage } from "./build-user-message";
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
  rationale: z.string().min(4).max(300),
  // Phase 6 structured fields — forward them through when the LLM
  // emits them. Keeps the design-rule checks effective on the new
  // additions, not just the originals.
  value: z.string().min(1).max(40).optional(),
  mpn: z.string().min(1).max(80).optional()
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

REPLACEMENT mechanism:
- You may REPLACE an existing BOM row by emitting an ADDITION with its designator (e.g. U1) and a different name, value, package, mpn, quantity, or status. The pipeline recognises "same designator, different fields" as a swap and records it as "Replaced U1: old → new — {rationale}".
- Use this when the better fix is changing an existing part (e.g. swapping an LDO for a buck regulator, upgrading an MCU) rather than adding alongside it.
- Identical re-assertion (same designator, all fields identical) is silently skipped — don't use it to pad the response.

Emit the improvements via the propose_design_improvements tool.`;

function formatUserMessage(input: ImproveDesignInput): string {
  const archLines = input.architectureBlocks
    .map((b) => `${b.label} (${b.kind}, id=${b.id}) → ${b.connections.join(", ") || "(no connections)"}`);
  const bomLines = input.bom
    .map((b) => `${b.designator}: ${b.name} (${b.package}, qty ${b.quantity}, ${b.status})`);
  const issueLines = input.validations.length > 0
    ? input.validations.map((v) => `[${v.severity}] ${v.title}: ${v.detail}`)
    : undefined;
  return buildUserMessage({
    sections: [
      { title: "Customer brief", text: input.prompt },
      { title: "Constraints", items: input.constraints, emptyLabel: "(none)" },
      { title: "Requirements", items: input.requirements },
      { title: "Current architecture", items: archLines },
      { title: "Current BOM", items: bomLines },
      { title: "Open validation issues", items: issueLines ?? [], emptyLabel: "(none currently flagged)" }
    ],
    instruction: "Propose improvements via the propose_design_improvements tool."
  });
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

  // Mutable "current state" — replacements modify this in place so
  // further iterations see the updated BOM.
  let nextBom = [...afterRemoval];

  for (const add of additions) {
    const existingIdx = nextBom.findIndex((b) => b.designator === add.designator);
    if (existingIdx >= 0) {
      const existing = nextBom[existingIdx];
      const isIdentical =
        existing.name === add.name &&
        existing.quantity === add.quantity &&
        existing.package === add.package &&
        existing.status === add.status &&
        (existing.value ?? undefined) === (add.value ?? undefined) &&
        (existing.mpn ?? undefined) === (add.mpn ?? undefined);
      if (isIdentical) {
        // True no-op — the LLM re-asserted the existing row. Silently skip.
        continue;
      }
      // REPLACEMENT: same designator, differing fields. Swap in place,
      // keep the stable id so references/revisions don't go stale.
      const replaced: BomItem = {
        ...existing,
        name: add.name,
        quantity: add.quantity,
        package: add.package,
        status: add.status,
        value: add.value ?? undefined,
        mpn: add.mpn ?? undefined
      };
      nextBom = [
        ...nextBom.slice(0, existingIdx),
        replaced,
        ...nextBom.slice(existingIdx + 1)
      ];
      changes.push(
        `Replaced ${add.designator}: ${existing.name} → ${add.name} — ${add.rationale}`
      );
      continue;
    }
    // Fresh addition
    const fresh: BomItem = {
      id: `bom-${add.designator.toLowerCase()}-${randomUUID().slice(0, 6)}`,
      designator: add.designator,
      name: add.name,
      quantity: add.quantity,
      package: add.package,
      status: add.status,
      ...(add.value ? { value: add.value } : {}),
      ...(add.mpn ? { mpn: add.mpn } : {})
    };
    nextBom = [...nextBom, fresh];
    changes.push(`Added ${add.designator} (${add.name}): ${add.rationale}`);
  }

  return { nextBom, changes };
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
    user: formatUserMessage(input),
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
