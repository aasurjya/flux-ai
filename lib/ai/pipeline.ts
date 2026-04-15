import type { AiClient } from "./client";
import { parseRequirements } from "./parse-requirements";
import { clarifyRequirements } from "./clarify";
import { generateArchitecture } from "./generate-architecture";
import { suggestBom } from "./suggest-bom";
import { validateDesign } from "./validate";
import { runDesignRules } from "./design-rules";
import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

export interface GenerationInput {
  prompt: string;
  constraints: string[];
  preferredParts: string[];
  clarifyingAnswers?: Record<string, string>;
}

export interface GenerationPause {
  kind: "paused";
  stage: "clarify";
  requirements: string[];
  questions: string[];
}

export interface GenerationComplete {
  kind: "complete";
  requirements: string[];
  architectureBlocks: CircuitBlock[];
  bom: BomItem[];
  validations: ValidationIssue[];
}

export type GenerationResult = GenerationPause | GenerationComplete;

/**
 * Orchestrate the full AI generation pipeline.
 *
 * Stages:
 *   1. parseRequirements
 *   2. clarifyRequirements (skipped if clarifyingAnswers provided)
 *        → if questions exist, PAUSE and return them to the caller
 *   3. generateArchitecture
 *   4. suggestBom
 *   5. validateDesign
 *
 * Every stage is a separate structured LLM call so failures are isolated
 * and retryable at the step boundary. The caller (project-store) is
 * responsible for persisting pause state and resuming with answers.
 */
export async function runGenerationPipeline(
  client: AiClient,
  input: GenerationInput
): Promise<GenerationResult> {
  const requirements = await parseRequirements(client, {
    prompt: input.prompt,
    constraints: input.constraints,
    preferredParts: input.preferredParts
  });

  if (!input.clarifyingAnswers) {
    const questions = await clarifyRequirements(client, {
      prompt: input.prompt,
      constraints: input.constraints,
      requirements
    });
    if (questions.length > 0) {
      return { kind: "paused", stage: "clarify", requirements, questions };
    }
  }

  const architectureBlocks = await generateArchitecture(client, {
    prompt: input.prompt,
    constraints: input.constraints,
    requirements,
    clarifyingAnswers: input.clarifyingAnswers
  });

  const bom = await suggestBom(client, {
    architectureBlocks,
    constraints: input.constraints,
    preferredParts: input.preferredParts
  });

  const llmValidations = await validateDesign(client, {
    architectureBlocks,
    bom,
    constraints: input.constraints,
    requirements
  });

  // Deterministic rule checks run alongside the LLM validator so the
  // pipeline catches universal hardware mistakes even when the LLM misses
  // them (or when the stub is used). Rules are deduped against LLM
  // output by (severity, title) pair.
  const ruleIssues = runDesignRules({
    requirements,
    architectureBlocks,
    bom,
    constraints: input.constraints
  });
  const validations = mergeValidations(llmValidations, ruleIssues);

  return { kind: "complete", requirements, architectureBlocks, bom, validations };
}

function mergeValidations(
  llm: ValidationIssue[],
  rules: ValidationIssue[]
): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of [...rules, ...llm]) {
    const key = `${issue.severity}::${issue.title.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}
