import { z } from "zod";
import type { AiClient } from "./client";
import { SUGGEST_BOM_SYSTEM } from "./prompts";
import { architectureSummary } from "./generate-architecture";
import type { BomItem, CircuitBlock } from "@/types/project";

const BomItemSchema = z.object({
  id: z.string().optional(), // LLM may omit — we assign from designator
  designator: z.string().regex(/^[A-Z]+[0-9]+(-[0-9]+)?$/, "designator must match e.g. U1, J1, R1-R2"),
  name: z.string().min(2).max(120),
  quantity: z.number().int().min(1).max(999),
  package: z.string().min(1).max(60),
  status: z.enum(["selected", "alternate", "needs_review"]),
  // Phase 6 structured fields — optional on the LLM side. Rules prefer
  // these over regex-on-name when present. Emit for every passive;
  // include mpn only when you're confident about the exact part.
  value: z.string().min(1).max(40).optional(),
  mpn: z.string().min(1).max(80).optional()
});

const ResponseSchema = z.object({
  items: z.array(BomItemSchema).min(1).max(40)
});

export interface SuggestBomInput {
  architectureBlocks: CircuitBlock[];
  constraints: string[];
  preferredParts?: string[];
}

function buildUserMessage(input: SuggestBomInput): string {
  const lines: string[] = [
    "# Architecture blocks",
    ...architectureSummary(input.architectureBlocks).map((line) => `- ${line}`),
    "",
    "# Constraints",
    input.constraints.length > 0 ? input.constraints.map((c) => `- ${c}`).join("\n") : "(none specified)"
  ];
  if (input.preferredParts && input.preferredParts.length > 0) {
    lines.push("", "# Preferred parts", input.preferredParts.map((p) => `- ${p}`).join("\n"));
  }
  lines.push("", "Emit the initial BOM via the emit_bom tool. Use needs_review when a specific part depends on info not yet provided.");
  return lines.join("\n");
}

function normalize(items: z.infer<typeof BomItemSchema>[]): BomItem[] {
  const seen = new Set<string>();
  const out: BomItem[] = [];
  for (const raw of items) {
    const designator = raw.designator.trim();
    if (seen.has(designator)) continue;
    seen.add(designator);
    out.push({
      id: raw.id?.trim() || `bom-${designator.toLowerCase()}`,
      designator,
      name: raw.name.trim(),
      quantity: raw.quantity,
      package: raw.package.trim(),
      status: raw.status,
      ...(raw.value ? { value: raw.value.trim() } : {}),
      ...(raw.mpn ? { mpn: raw.mpn.trim() } : {})
    });
  }
  return out;
}

export async function suggestBom(
  client: AiClient,
  input: SuggestBomInput
): Promise<BomItem[]> {
  if (input.architectureBlocks.length === 0) {
    throw new Error("suggestBom: architectureBlocks must be non-empty");
  }

  const response = await client.callStructured({
    system: SUGGEST_BOM_SYSTEM,
    user: buildUserMessage(input),
    schema: ResponseSchema,
    schemaName: "emit_bom",
    schemaDescription:
      "Emit an initial BOM list. Each item covers a block or grouped sub-function. Use needs_review for underspecified choices; never fabricate part numbers."
  });

  return normalize(response.items);
}
