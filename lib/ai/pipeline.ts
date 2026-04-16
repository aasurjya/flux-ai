import type { AiClient } from "./client";
import { parseRequirements } from "./parse-requirements";
import { clarifyRequirements } from "./clarify";
import { generateArchitecture } from "./generate-architecture";
import { suggestBom } from "./suggest-bom";
import { validateDesign } from "./validate";
import { runDesignRules } from "./design-rules";
import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

export type PipelineStage =
  | "requirements"
  | "clarify"
  | "architecture"
  | "bom"
  | "validation";

export type StageStatus = "running" | "completed" | "error";

export type StageDetail = {
  count?: number;
  error?: string;
};

export type OnStage = (
  stage: PipelineStage,
  status: StageStatus,
  detail?: StageDetail
) => void;

export interface GenerationInput {
  prompt: string;
  constraints: string[];
  preferredParts: string[];
  clarifyingAnswers?: Record<string, string>;
  /**
   * Optional progress hook. Called twice per stage (running → completed),
   * or once with status="error" if the stage throws. Pure side-channel —
   * does NOT affect return value. Used by the SSE route to stream
   * progress to the browser; unit tests assert the call sequence.
   */
  onStage?: OnStage;
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
  // Wrap each stage with running → completed/error notifications so the
  // SSE route can narrate progress without the pipeline needing to know
  // about streaming. The helper swallows nothing — errors still bubble.
  const withStage = async <T>(
    stage: PipelineStage,
    fn: () => Promise<T>,
    detail?: (result: T) => StageDetail
  ): Promise<T> => {
    input.onStage?.(stage, "running");
    try {
      const out = await fn();
      input.onStage?.(stage, "completed", detail?.(out));
      return out;
    } catch (err) {
      input.onStage?.(stage, "error", {
        error: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  };

  const requirements = await withStage(
    "requirements",
    () =>
      parseRequirements(client, {
        prompt: input.prompt,
        constraints: input.constraints,
        preferredParts: input.preferredParts
      }),
    (r) => ({ count: r.length })
  );

  if (!input.clarifyingAnswers) {
    const questions = await withStage(
      "clarify",
      () =>
        clarifyRequirements(client, {
          prompt: input.prompt,
          constraints: input.constraints,
          requirements
        }),
      (q) => ({ count: q.length })
    );
    if (questions.length > 0) {
      return { kind: "paused", stage: "clarify", requirements, questions };
    }
  }

  const architectureBlocks = await withStage(
    "architecture",
    () =>
      generateArchitecture(client, {
        prompt: input.prompt,
        constraints: input.constraints,
        requirements,
        clarifyingAnswers: input.clarifyingAnswers
      }),
    (a) => ({ count: a.length })
  );

  const bom = await withStage(
    "bom",
    () =>
      suggestBom(client, {
        architectureBlocks,
        constraints: input.constraints,
        preferredParts: input.preferredParts
      }),
    (b) => ({ count: b.length })
  );

  const validations = await withStage(
    "validation",
    async () => {
      const llmValidations = await validateDesign(client, {
        architectureBlocks,
        bom,
        constraints: input.constraints,
        requirements
      });
      // Deterministic rule checks run alongside the LLM validator so the
      // pipeline catches universal hardware mistakes even when the LLM
      // misses them (or when the stub is used). Rules are deduped against
      // LLM output by (severity, title) pair.
      const ruleIssues = runDesignRules({
        requirements,
        architectureBlocks,
        bom,
        constraints: input.constraints
      });
      return mergeValidations(llmValidations, ruleIssues);
    },
    (v) => ({ count: v.length })
  );

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
