import type { AiClient } from "./client";
import { parseRequirements } from "./parse-requirements";
import { clarifyRequirements } from "./clarify";
import { generateArchitecture } from "./generate-architecture";
import { suggestBom } from "./suggest-bom";
import { validateDesign } from "./validate";
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

  const validations = await validateDesign(client, {
    architectureBlocks,
    bom,
    constraints: input.constraints,
    requirements
  });

  return { kind: "complete", requirements, architectureBlocks, bom, validations };
}
