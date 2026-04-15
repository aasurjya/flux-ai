import { z } from "zod";
import type { AiClient } from "./client";
import { GENERATE_ARCHITECTURE_SYSTEM } from "./prompts";
import type { CircuitBlock, CircuitBlockKind } from "@/types/project";

const KINDS: readonly CircuitBlockKind[] = [
  "power",
  "processing",
  "sensor",
  "interface",
  "storage",
  "analog",
  "protection"
] as const;

const BlockSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/, "id must be kebab-case lowercase alnum"),
  label: z.string().min(2).max(60),
  kind: z.enum(KINDS as unknown as [CircuitBlockKind, ...CircuitBlockKind[]]),
  connections: z.array(z.string()).max(12)
});

const ResponseSchema = z.object({
  blocks: z.array(BlockSchema).min(2).max(14)
});

export interface GenerateArchitectureInput {
  prompt: string;
  constraints: string[];
  requirements: string[];
  clarifyingAnswers?: Record<string, string>;
}

function buildUserMessage(input: GenerateArchitectureInput): string {
  const lines: string[] = [
    "# Customer brief",
    input.prompt.trim(),
    "",
    "# Constraints",
    input.constraints.length > 0 ? input.constraints.map((c) => `- ${c}`).join("\n") : "(none specified)",
    "",
    "# Requirements",
    input.requirements.map((r) => `- ${r}`).join("\n")
  ];
  if (input.clarifyingAnswers && Object.keys(input.clarifyingAnswers).length > 0) {
    lines.push("", "# Clarifying answers");
    for (const [q, a] of Object.entries(input.clarifyingAnswers)) {
      lines.push(`- Q: ${q}\n  A: ${a}`);
    }
  }
  lines.push("", "Emit the block-level architecture via the emit_architecture tool.");
  return lines.join("\n");
}

/**
 * Deduplicate by id (keep first occurrence) and drop connections that
 * reference nonexistent block ids. Keeps downstream consumers safe from
 * dangling edges without rejecting an otherwise-useful LLM output.
 */
function sanitize(blocks: CircuitBlock[]): CircuitBlock[] {
  const byId = new Map<string, CircuitBlock>();
  for (const b of blocks) {
    if (!byId.has(b.id)) byId.set(b.id, b);
  }
  const validIds = new Set(byId.keys());
  return Array.from(byId.values()).map((b) => ({
    ...b,
    connections: b.connections.filter((id) => id !== b.id && validIds.has(id))
  }));
}

export async function generateArchitecture(
  client: AiClient,
  input: GenerateArchitectureInput
): Promise<CircuitBlock[]> {
  if (input.requirements.length === 0) {
    throw new Error("generateArchitecture: requirements list must be non-empty");
  }

  const response = await client.callStructured({
    system: GENERATE_ARCHITECTURE_SYSTEM,
    user: buildUserMessage(input),
    schema: ResponseSchema,
    schemaName: "emit_architecture",
    schemaDescription:
      "Emit a block-level circuit architecture. Each block references other blocks by id via connections."
  });

  return sanitize(response.blocks);
}

/**
 * Produce `string[]` summary lines for the legacy `outputs.architecture`
 * field (kept for backward compatibility and simple rendering).
 */
export function architectureSummary(blocks: CircuitBlock[]): string[] {
  const labelById = new Map(blocks.map((b) => [b.id, b.label]));
  return blocks.map((b) => {
    const connections = b.connections
      .map((id) => labelById.get(id))
      .filter((label): label is string => Boolean(label));
    const suffix = connections.length > 0 ? `, connects to: ${connections.join(", ")}` : ", no connections";
    return `${b.label} — ${b.kind}${suffix}`;
  });
}
