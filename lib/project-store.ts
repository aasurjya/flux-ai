import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mockProjects } from "@/lib/mock-data";
import { ProjectSummary } from "@/types/project";
import { ProjectSummarySchema } from "@/lib/project-schema";
import type { AiClient } from "@/lib/ai/client";
import { getAiClient } from "@/lib/ai/client";
import { createStubAiClient } from "@/lib/ai/stub-client";
import { runGenerationPipeline } from "@/lib/ai/pipeline";
import { architectureSummary } from "@/lib/ai/generate-architecture";
import { improveDesign } from "@/lib/ai/improve-design";
import { runDesignRules } from "@/lib/ai/design-rules";
import { buildKicadExport } from "@/lib/kicad/bundle";

/**
 * In-process promise-chain mutex. Every mutating call routes through
 * withStoreLock so concurrent read-modify-write sequences don't
 * clobber each other on the shared JSON file.
 *
 * This is a single-process server protection — it does NOT protect
 * against multiple Next.js worker processes or multiple deployments
 * hitting the same file. For that, move to SQLite.
 */
let storeLock: Promise<unknown> = Promise.resolve();
function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = storeLock.then(fn, fn);
  // Detach: errors in one holder must not poison the next waiter
  storeLock = next.catch(() => {
    /* swallow */
  });
  return next;
}

interface CreateProjectInput {
  name: string;
  prompt: string;
  constraints: string[];
  preferredParts: string[];
}

function getProjectsFilePath(): string {
  return process.env.FLUX_PROJECTS_FILE ?? path.join(process.cwd(), "data", "projects.json");
}

function splitListValue(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

import { slugify } from "@/lib/utils";

function isFileNotFoundError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readStoredProjects(): Promise<ProjectSummary[]> {
  try {
    const fileContents = await fs.readFile(getProjectsFilePath(), "utf8");
    const raw = JSON.parse(fileContents);
    if (!Array.isArray(raw)) return [];
    // Schema-validate every entry. Drop invalid ones rather than crash
    // the entire read — one corrupt record shouldn't blow up the UI.
    const valid: ProjectSummary[] = [];
    for (const item of raw) {
      const parsed = ProjectSummarySchema.safeParse(item);
      if (parsed.success) {
        valid.push(parsed.data);
      } else {
        console.warn(
          `[project-store] dropping invalid stored project (${item?.id ?? "unknown"}): ${parsed.error.issues[0]?.message ?? "schema mismatch"}`
        );
      }
    }
    return valid;
  } catch (error) {
    if (isFileNotFoundError(error)) return [];
    if (error instanceof SyntaxError) {
      // File exists but is corrupt JSON. Log and start fresh — the
      // alternative (throw) bricks every request until a human edits
      // the file. Starting fresh also preserves mockProjects as seed.
      console.error("[project-store] projects.json is not valid JSON, starting fresh");
      return [];
    }
    throw error;
  }
}

async function writeStoredProjects(projects: ProjectSummary[]) {
  // Atomic write via temp + rename. Avoids truncating the real file
  // mid-write on crash / SIGTERM / out-of-disk.
  const filePath = getProjectsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(projects, null, 2), "utf8");
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup if rename fails
    fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

function buildStarterBom(preferredParts: string[]): ProjectSummary["outputs"]["bom"] {
  if (preferredParts.length > 0) {
    return preferredParts.slice(0, 4).map((part, index) => ({
      id: `bom-${index + 1}`,
      designator: `U${index + 1}`,
      name: part,
      quantity: 1,
      package: "TBD",
      status: "needs_review"
    }));
  }

  return [
    {
      id: "bom-1",
      designator: "U1",
      name: "Primary controller",
      quantity: 1,
      package: "TBD",
      status: "needs_review"
    },
    {
      id: "bom-2",
      designator: "U2",
      name: "Power regulation stage",
      quantity: 1,
      package: "TBD",
      status: "needs_review"
    }
  ];
}

function buildProjectFromInput(input: CreateProjectInput, existingProjects: ProjectSummary[]): ProjectSummary {
  const existingIds = new Set(existingProjects.map((project) => project.id));
  const baseSlug = slugify(input.name) || `project-${Date.now()}`;
  let projectId = baseSlug;
  let suffix = 2;

  while (existingIds.has(projectId)) {
    projectId = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const normalizedConstraints = input.constraints.length > 0 ? input.constraints : ["Constraints pending review"];
  const normalizedPreferredParts = input.preferredParts.length > 0 ? input.preferredParts : ["Preferred parts not specified yet"];

  return {
    id: projectId,
    name: input.name,
    prompt: input.prompt,
    status: "draft",
    updatedAt: new Date().toISOString(),
    constraints: normalizedConstraints,
    outputs: {
      requirements: [
        `Primary objective: ${input.prompt}`,
        `Constraints to honor: ${normalizedConstraints.join(", ")}`,
        `Preferred parts to evaluate: ${normalizedPreferredParts.join(", ")}`,
        "Review power, connector, programming, and manufacturability decisions before export."
      ],
      architecture: [
        "Power entry and protection block",
        "Main control or processing block",
        "Peripheral and sensor integration block",
        "Programming, debug, and connectivity block"
      ],
      bom: buildStarterBom(input.preferredParts),
      validations: [
        {
          id: `validation-${randomUUID()}`,
          severity: "warning",
          title: "Confirm the power tree",
          detail: "Validate input voltage, regulation strategy, and battery or external power expectations before schematic export."
        },
        {
          id: `validation-${randomUUID()}`,
          severity: input.preferredParts.length > 0 ? "info" : "warning",
          title: "Review selected components",
          detail:
            input.preferredParts.length > 0
              ? `Verify footprint, availability, and lifecycle for: ${input.preferredParts.join(", ")}.`
              : "No preferred components were provided yet. Confirm the primary controller, regulator, and interface parts."
        }
      ],
      exportReady: false
    },
    revisions: [
      {
        id: `rev-${randomUUID()}`,
        title: "Initial brief",
        description: "Created from the project prompt and first-pass constraints.",
        createdAt: new Date().toISOString(),
        changes: [
          "Saved the project brief",
          "Created starter architecture blocks",
          "Prepared first review items and BOM placeholders"
        ]
      }
    ]
  };
}

export async function getProjects() {
  const storedProjects = await readStoredProjects();

  return [...storedProjects, ...mockProjects];
}

export async function getProjectById(id: string) {
  const projects = await getProjects();

  return projects.find((project) => project.id === id);
}

export async function createProject(input: CreateProjectInput) {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const project = buildProjectFromInput(input, [...storedProjects, ...mockProjects]);
    storedProjects.unshift(project);
    await writeStoredProjects(storedProjects);
    return project;
  });
}

export async function deleteProject(projectId: string): Promise<boolean> {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const idx = storedProjects.findIndex((p) => p.id === projectId);
    if (idx === -1) return false;
    // Unlink any remaining export zips for this project (best effort)
    const jobs = storedProjects[idx].exportJobs ?? [];
    await Promise.all(
      jobs.map((j) =>
        fs.unlink(getExportFilePath(j.id)).catch(() => {
          /* already gone is fine */
        })
      )
    );
    storedProjects.splice(idx, 1);
    await writeStoredProjects(storedProjects);
    return true;
  });
}

/**
 * Import a project from an external JSON payload (e.g. a previously
 * exported .flux.json). The source has already been validated against
 * ProjectSummarySchema by the caller.
 *
 * Safety:
 *   - Always assigns a FRESH project id (collision-safe slug + suffix)
 *     so imports never clobber existing projects
 *   - Regenerates every revision id via randomUUID (source ids may
 *     collide with existing revisions OR with each other after import)
 *   - Strips exportJobs — they reference zip files on the original
 *     machine's disk that don't exist here. Leaving them would produce
 *     broken download links in the UI.
 *   - Uses a fresh updatedAt timestamp
 */
export async function importProject(source: ProjectSummary): Promise<ProjectSummary> {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const existingIds = new Set([...storedProjects, ...mockProjects].map((p) => p.id));

    const baseSlug = slugify(source.name) || `imported-${Date.now()}`;
    let newId = baseSlug;
    let suffix = 2;
    while (existingIds.has(newId)) {
      newId = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const imported: ProjectSummary = {
      ...source,
      id: newId,
      updatedAt: new Date().toISOString(),
      revisions: source.revisions.map((r) => ({
        ...r,
        id: `rev-${randomUUID()}`
      })),
      // Always strip export jobs — their zip files don't exist on this host
      exportJobs: []
    };

    storedProjects.unshift(imported);
    await writeStoredProjects(storedProjects);
    return imported;
  });
}

interface AddRevisionInput {
  projectId: string;
  title: string;
  description: string;
  changes: string[];
}

export async function addRevision(input: AddRevisionInput) {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const projectIndex = storedProjects.findIndex((p) => p.id === input.projectId);
    if (projectIndex === -1) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const project = storedProjects[projectIndex];
    const newRevision = {
      id: `rev-${randomUUID()}`,
      title: input.title,
      description: input.description,
      createdAt: new Date().toISOString(),
      changes: input.changes
    };
    const updatedProject = {
      ...project,
      revisions: [newRevision, ...project.revisions],
      updatedAt: new Date().toISOString(),
      status: "review" as const
    };
    storedProjects[projectIndex] = updatedProject;
    await writeStoredProjects(storedProjects);
    return updatedProject;
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
  const nextValidations = [...nextRules, ...keptLlmValidations];

  // Phase 3 (locked): persist
  return withStoreLock(async () => {
    const latestStored = await readStoredProjects();
    const latestIndex = latestStored.findIndex((p) => p.id === projectId);
    if (latestIndex === -1) {
      throw new Error("Project was deleted during improvement");
    }
    const latestProject = latestStored[latestIndex];
    const newRevision = {
      id: `rev-${randomUUID()}`,
      title: `AI improvement: ${improvement.summary.slice(0, 80)}`,
      description: improvement.summary,
      createdAt: new Date().toISOString(),
      changes: improvement.changes
    };
    const updated: ProjectSummary = {
      ...latestProject,
      status: "review",
      updatedAt: new Date().toISOString(),
      outputs: {
        ...latestProject.outputs,
        bom: improvement.nextBom,
        validations: nextValidations,
        exportReady: false
      },
      revisions: [newRevision, ...latestProject.revisions]
    };
    latestStored[latestIndex] = updated;
    await writeStoredProjects(latestStored);
    return updated;
  });
}

interface GenerateProjectInput {
  projectId: string;
  clarifyingAnswers?: Record<string, string>;
  client?: AiClient; // injected in tests
}

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
function selectPipelineClient(): AiClient {
  if (process.env.USE_REAL_AI === "true") {
    return getAiClient();
  }
  return createStubAiClient();
}

export async function generateProject({
  projectId,
  clarifyingAnswers,
  client
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
    clarifyingAnswers: effectiveAnswers
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
      ]
    };

    const updated: ProjectSummary = {
      ...currentProject,
      status: "review",
      updatedAt: new Date().toISOString(),
      outputs: {
        requirements: result.requirements,
        architecture: architectureSummary(result.architectureBlocks),
        architectureBlocks: result.architectureBlocks,
        bom: result.bom,
        validations: result.validations,
        exportReady: false
      },
      clarifyingQuestions: undefined,
      clarifyingAnswers: effectiveAnswers,
      revisions: [generationRevision, ...currentProject.revisions]
    };

    storedProjects[projectIndex] = updated;
    await writeStoredProjects(storedProjects);
    return updated;
  });
}

interface CreateExportJobInput {
  projectId: string;
  format: "kicad";
}

export async function createExportJob(input: CreateExportJobInput) {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const projectIndex = storedProjects.findIndex((p) => p.id === input.projectId);
    if (projectIndex === -1) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const project = storedProjects[projectIndex];
    const jobId = `export-${randomUUID()}`;
    const newJob = {
      id: jobId,
      projectId: input.projectId,
      status: "pending" as const,
      format: input.format,
      createdAt: new Date().toISOString(),
      logs: ["Initializing export job..."]
    };
    const updatedProject = {
      ...project,
      status: "exporting" as const,
      exportJobs: [newJob, ...(project.exportJobs ?? [])]
    };
    storedProjects[projectIndex] = updatedProject;
    await writeStoredProjects(storedProjects);
    return { job: newJob, project: updatedProject };
  });
}

export async function getExportJob(projectId: string, jobId: string) {
  const storedProjects = await readStoredProjects();
  const project = storedProjects.find((p) => p.id === projectId);

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const job = project.exportJobs?.find((j) => j.id === jobId);
  return job ?? null;
}

function getExportsDir(): string {
  return process.env.FLUX_EXPORTS_DIR ?? path.join(process.cwd(), "data", "exports");
}

export function getExportFilePath(jobId: string): string {
  // Defence-in-depth: guarantee the resolved path stays inside the
  // exports directory regardless of what the caller passes. This
  // protects against future misuse where an unvalidated jobId flows
  // into this function — the regex guard in the API route is a first
  // line, this is the second.
  const exportsDir = path.resolve(getExportsDir());
  const candidate = path.resolve(path.join(exportsDir, `${jobId}.zip`));
  if (candidate !== exportsDir && !candidate.startsWith(exportsDir + path.sep)) {
    throw new Error(`Invalid export jobId (escapes exports dir): ${jobId}`);
  }
  return candidate;
}

/**
 * Strip filesystem + environment paths from error messages before they
 * reach the client. Prevents leakage of install paths, cwd, tmpdir, etc.
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(^|\s)\/[A-Za-z0-9_\-./]+/g, "$1[path]")
    .replace(/[A-Za-z]:\\[A-Za-z0-9_\-\\.]+/g, "[path]")
    .slice(0, 300);
}

/**
 * Garbage-collect old export zips for a given project. We keep only the
 * most recent `keepLatest` zip files per project to prevent unbounded
 * disk growth. Called before writing a new export.
 *
 * Without this, every "Export to KiCad" click leaves a zip on disk
 * forever. A user who iterates on a design 50 times fills their disk
 * with stale exports. The old downloadUrl links also break — we'd
 * serve 404 for any GC'd job — so we also prune completed export_jobs
 * from the project whose zip no longer exists.
 */
async function gcOldExports(
  projectId: string,
  keepLatest: number,
  exportJobs: ProjectSummary["exportJobs"]
): Promise<Set<string>> {
  const completedJobs = (exportJobs ?? [])
    .filter((j) => j.projectId === projectId && (j.status === "completed" || j.status === "failed"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const keepJobIds = new Set(completedJobs.slice(0, keepLatest).map((j) => j.id));
  const removeJobIds = new Set(
    completedJobs.slice(keepLatest).map((j) => j.id)
  );

  for (const jobId of removeJobIds) {
    try {
      await fs.unlink(getExportFilePath(jobId));
    } catch (err) {
      // File already gone is fine — other errors we ignore to avoid
      // blocking a new export because of a stale cleanup failure.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Swallow other fs errors silently: cleanup must never break
        // the hot path of a new export.
      }
    }
  }
  return keepJobIds;
}

/**
 * Run a KiCad export job synchronously: generate the bundle, persist
 * the zip to disk, and mark the job completed. Failures are captured on
 * the job record so the UI can surface them without crashing the page.
 */
export async function runExportJob(projectId: string, jobId: string) {
  // Phase 1 (locked): validate + mark running + GC old exports
  const prelude = await withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const projectIndex = storedProjects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) throw new Error(`Project not found: ${projectId}`);
    const project = storedProjects[projectIndex];
    const jobs = project.exportJobs ?? [];
    const jobIndex = jobs.findIndex((j) => j.id === jobId);
    if (jobIndex === -1) throw new Error(`Export job not found: ${jobId}`);

    const keepJobIds = await gcOldExports(projectId, 3, jobs);
    const retainedJobs = jobs.filter(
      (j) =>
        j.id === jobId ||
        j.status === "pending" ||
        j.status === "running" ||
        keepJobIds.has(j.id)
    );
    const retainedIndex = retainedJobs.findIndex((j) => j.id === jobId);
    const runningLogs = [...retainedJobs[retainedIndex].logs, "Validating project outputs..."];
    const runningJob = { ...retainedJobs[retainedIndex], status: "running" as const, logs: runningLogs };
    retainedJobs[retainedIndex] = runningJob;
    storedProjects[projectIndex] = { ...project, exportJobs: retainedJobs };
    await writeStoredProjects(storedProjects);
    return { project };
  });
  const { project } = prelude;

  // Phase 2 (unlocked): the CPU/IO-heavy bundle build. Holding the lock
  // here would block every other project operation for the duration.
  let completedLogs: string[];
  let failureMessage: string | null = null;
  try {
    const architectureBlocks = project.outputs.architectureBlocks;
    if (!architectureBlocks || architectureBlocks.length === 0) {
      throw new Error(
        "Cannot export: project has no architecture blocks. Run 'Generate design' first."
      );
    }
    if (project.outputs.bom.length === 0) {
      throw new Error("Cannot export: BOM is empty.");
    }
    await buildKicadExport({
      projectName: project.name,
      bom: project.outputs.bom,
      architectureBlocks,
      outPath: getExportFilePath(jobId)
    });
    completedLogs = [
      `Generated ${project.name}.kicad_pro, .kicad_sch, .kicad_sym`,
      `Generated ${project.name}-netlist.xml and ${project.name}-bom.csv`,
      "Packaged into zip and persisted to exports directory"
    ];
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    failureMessage = sanitizeErrorMessage(rawMessage);
    console.error(`[runExportJob] failed projectId=${projectId} jobId=${jobId}`, error);
    completedLogs = [];
  }

  // Phase 3 (locked): write the final status. Guard every index lookup
  // — in the time we held no lock, another request could have deleted
  // the project or the job. If so, re-throw the original failure.
  return withStoreLock(async () => {
    const latestStored = await readStoredProjects();
    const latestIndex = latestStored.findIndex((p) => p.id === projectId);
    if (latestIndex === -1) {
      // Project vanished. Best-effort cleanup of the orphan zip.
      await fs.unlink(getExportFilePath(jobId)).catch(() => {});
      if (failureMessage) throw new Error(failureMessage);
      throw new Error("Project was deleted during export");
    }
    const latestProject = latestStored[latestIndex];
    const latestJobs = latestProject.exportJobs ?? [];
    const latestJobIndex = latestJobs.findIndex((j) => j.id === jobId);
    if (latestJobIndex === -1) {
      if (failureMessage) throw new Error(failureMessage);
      throw new Error("Export job was cancelled during run");
    }
    const latestJob = latestJobs[latestJobIndex];

    const finalJob = failureMessage
      ? {
          ...latestJob,
          status: "failed" as const,
          error: failureMessage,
          logs: [...latestJob.logs, `Export failed: ${failureMessage}`]
        }
      : {
          ...latestJob,
          status: "completed" as const,
          completedAt: new Date().toISOString(),
          downloadUrl: `/api/exports/${jobId}/download`,
          logs: [...latestJob.logs, ...completedLogs]
        };

    const updatedJobs = [...latestJobs];
    updatedJobs[latestJobIndex] = finalJob;
    latestStored[latestIndex] = {
      ...latestProject,
      status: failureMessage ? latestProject.status : ("exported" as const),
      exportJobs: updatedJobs
    };
    await writeStoredProjects(latestStored);
    return finalJob;
  });
}

export { splitListValue, slugify };
