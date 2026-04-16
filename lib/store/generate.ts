import { randomUUID } from "node:crypto";
import type { ProjectSummary } from "@/types/project";
import type { AiClient } from "@/lib/ai/client";
import { getAiClient } from "@/lib/ai/client";
import { createStubAiClient } from "@/lib/ai/stub-client";
import { runGenerationPipeline } from "@/lib/ai/pipeline";
import { architectureSummary } from "@/lib/ai/generate-architecture";
import { improveDesign } from "@/lib/ai/improve-design";
import { runDesignRules } from "@/lib/ai/design-rules";
import { carryDismissalsForward } from "@/lib/ai/carry-dismissals";
import { track } from "@/lib/telemetry";
import {
  withStoreLock,
  readStoredProjects,
  writeStoredProjects
} from "@/lib/store/persistence";

/**
 * Picks the AI client used by the generation pipeline.
 *
 *   USE_REAL_AI=true  → real Anthropic client
 *                       REQUIRES ANTHROPIC_API_KEY env var, or getAiClient()
 *                       throws "AI client requires ANTHROPIC_API_KEY" at
 *                       the first call (not at import time).
 *   anything else     → deterministic stub (fast, offline, no API cost,
 *                       no key required — ideal for CI/dev/demos).
 *
 * Tests can bypass this by passing `client: ...` into generateProject
 * or runImproveDesign directly.
 */
export function selectPipelineClient(): AiClient {
  if (process.env.USE_REAL_AI === "true") {
    return getAiClient();
  }
  return createStubAiClient();
}

interface GenerateProjectInput {
  projectId: string;
  clarifyingAnswers?: Record<string, string>;
  client?: AiClient; // injected in tests
  /**
   * Optional progress hook threaded straight through to the pipeline.
   * SSE route uses this to stream running/completed events per stage
   * while the generation runs. Leaving it undefined preserves the
   * original synchronous semantics used by the existing server action.
   */
  onStage?: import("@/lib/ai/pipeline").OnStage;
}

export async function generateProject({
  projectId,
  clarifyingAnswers,
  client,
  onStage
}: GenerateProjectInput): Promise<ProjectSummary> {
  // Read project inside the lock, then release the lock while the LLM
  // call runs (can be 30s+), then re-acquire to persist the result.
  // If the project moved out from under us, we still write atomically.
  const prelude = await withStoreLock(async () => {
    const stored = await readStoredProjects();
    const idx = stored.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error(`Project not found: ${projectId}`);
    return { project: stored[idx], effectiveAnswers: clarifyingAnswers ?? stored[idx].clarifyingAnswers };
  });
  const { project, effectiveAnswers } = prelude;

  const ai = client ?? selectPipelineClient();
  const result = await runGenerationPipeline(ai, {
    prompt: project.prompt,
    constraints: project.constraints,
    preferredParts: [], // TODO wire through from create form when needed
    clarifyingAnswers: effectiveAnswers,
    onStage
  });

  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const projectIndex = storedProjects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) throw new Error(`Project not found: ${projectId}`);
    const currentProject = storedProjects[projectIndex];

    if (result.kind === "paused") {
      const paused: ProjectSummary = {
        ...currentProject,
        status: "generating",
        updatedAt: new Date().toISOString(),
        outputs: {
          ...currentProject.outputs,
          requirements: result.requirements
        },
        clarifyingQuestions: result.questions,
        clarifyingAnswers: undefined
      };
      storedProjects[projectIndex] = paused;
      await writeStoredProjects(storedProjects);
      return paused;
    }

    // Carry user dismissals from the prior validations forward — running
    // Generate a second time should not resurrect warnings the user
    // already accepted. Matches by id and by (severity, title) fallback.
    const carriedValidations = carryDismissalsForward(
      result.validations,
      currentProject.outputs.validations
    );
    const newOutputs = {
      requirements: result.requirements,
      architecture: architectureSummary(result.architectureBlocks),
      architectureBlocks: result.architectureBlocks,
      bom: result.bom,
      validations: carriedValidations,
      exportReady: false
    };
    const generationRevision = {
      id: `rev-${randomUUID()}`,
      title: "AI generation",
      description: "Ran prompt → requirements → architecture → BOM → validation through the AI pipeline.",
      createdAt: new Date().toISOString(),
      changes: [
        `Produced ${result.requirements.length} requirements`,
        `Generated ${result.architectureBlocks.length}-block architecture`,
        `Selected ${result.bom.length} BOM items`,
        `Flagged ${result.validations.length} validation issues`
      ],
      // Snapshot the NEW outputs (what this revision produced), not the
      // old ones — so comparing old→new shows what changed.
      snapshot: {
        bom: newOutputs.bom,
        validations: newOutputs.validations,
        architectureBlocks: newOutputs.architectureBlocks
      }
    };

    const updated: ProjectSummary = {
      ...currentProject,
      status: "review",
      updatedAt: new Date().toISOString(),
      outputs: newOutputs,
      clarifyingQuestions: undefined,
      clarifyingAnswers: effectiveAnswers,
      revisions: [generationRevision, ...currentProject.revisions]
    };

    storedProjects[projectIndex] = updated;
    await writeStoredProjects(storedProjects);
    void track("pipeline.completed");
    return updated;
  });
}

/**
 * AI-driven design improvement. Reads the current project state,
 * asks the LLM to propose targeted BOM edits (typically to resolve
 * outstanding validation issues), applies them, re-runs deterministic
 * design rules over the new BOM, and records a revision explaining
 * the changes. Replaces the earlier cosmetic stub.
 */
export async function runImproveDesign({
  projectId,
  client
}: {
  projectId: string;
  client?: AiClient;
}): Promise<ProjectSummary> {
  // Phase 1 (locked): read the project snapshot
  const prelude = await withStoreLock(async () => {
    const stored = await readStoredProjects();
    const idx = stored.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error(`Project not found: ${projectId}`);
    return { project: stored[idx] };
  });
  const { project } = prelude;

  const architectureBlocks = project.outputs.architectureBlocks ?? [];
  if (architectureBlocks.length === 0) {
    throw new Error(
      "Cannot improve: project has no architecture yet. Run 'Generate design' first."
    );
  }

  // Phase 2 (unlocked): LLM call
  const ai = client ?? selectPipelineClient();
  const improvement = await improveDesign(ai, {
    prompt: project.prompt,
    requirements: project.outputs.requirements,
    architectureBlocks,
    bom: project.outputs.bom,
    validations: project.outputs.validations,
    constraints: project.constraints
  });

  // Re-run deterministic design rules against the new BOM so the
  // validations list reflects what the improvement resolved or
  // introduced. The LLM validator is NOT re-run here (expensive + the
  // architecture didn't change). Existing LLM validations are kept.
  const nextRules = runDesignRules({
    requirements: project.outputs.requirements,
    architectureBlocks,
    bom: improvement.nextBom,
    constraints: project.constraints
  });
  const oldRuleIds = new Set(
    project.outputs.validations
      .filter((v) => v.id.startsWith("dr-"))
      .map((v) => v.id)
  );
  const keptLlmValidations = project.outputs.validations.filter(
    (v) => !oldRuleIds.has(v.id)
  );
  // Carry user dismissals forward so re-running rules doesn't
  // resurrect issues the user already accepted as known trade-offs.
  const carriedRules = carryDismissalsForward(
    nextRules,
    project.outputs.validations
  );
  const nextValidations = [...carriedRules, ...keptLlmValidations];

  // Phase 3 (locked): persist
  return withStoreLock(async () => {
    const latestStored = await readStoredProjects();
    const latestIndex = latestStored.findIndex((p) => p.id === projectId);
    if (latestIndex === -1) {
      throw new Error("Project was deleted during improvement");
    }
    const latestProject = latestStored[latestIndex];
    const nextOutputs = {
      ...latestProject.outputs,
      bom: improvement.nextBom,
      validations: nextValidations,
      exportReady: false
    };
    const newRevision = {
      id: `rev-${randomUUID()}`,
      title: `AI improvement: ${improvement.summary.slice(0, 80)}`,
      description: improvement.summary,
      createdAt: new Date().toISOString(),
      changes: improvement.changes,
      // Snapshot the POST-improvement outputs so the diff shows what
      // this iteration actually produced.
      snapshot: {
        bom: nextOutputs.bom,
        validations: nextOutputs.validations,
        architectureBlocks: nextOutputs.architectureBlocks
      }
    };
    const updated: ProjectSummary = {
      ...latestProject,
      status: "review",
      updatedAt: new Date().toISOString(),
      outputs: nextOutputs,
      revisions: [newRevision, ...latestProject.revisions]
    };
    latestStored[latestIndex] = updated;
    await writeStoredProjects(latestStored);
    void track("improve.clicked");
    return updated;
  });
}
