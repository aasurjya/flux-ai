import { promises as fs } from "node:fs";
import path from "node:path";
import { mockProjects } from "@/lib/mock-data";
import { ProjectSummary } from "@/types/project";
import type { AiClient } from "@/lib/ai/client";
import { getAiClient } from "@/lib/ai/client";
import { createStubAiClient } from "@/lib/ai/stub-client";
import { runGenerationPipeline } from "@/lib/ai/pipeline";
import { architectureSummary } from "@/lib/ai/generate-architecture";
import { buildKicadExport } from "@/lib/kicad/bundle";

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isFileNotFoundError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readStoredProjects() {
  try {
    const fileContents = await fs.readFile(getProjectsFilePath(), "utf8");
    const parsedProjects = JSON.parse(fileContents) as ProjectSummary[];

    return Array.isArray(parsedProjects) ? parsedProjects : [];
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

async function writeStoredProjects(projects: ProjectSummary[]) {
  const filePath = getProjectsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(projects, null, 2), "utf8");
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
    updatedAt: "Updated just now",
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
          id: "validation-1",
          severity: "warning",
          title: "Confirm the power tree",
          detail: "Validate input voltage, regulation strategy, and battery or external power expectations before schematic export."
        },
        {
          id: "validation-2",
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
        id: "rev-1",
        title: "Initial brief",
        description: "Created from the project prompt and first-pass constraints.",
        createdAt: "Just now",
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
  const storedProjects = await readStoredProjects();
  const project = buildProjectFromInput(input, [...storedProjects, ...mockProjects]);

  storedProjects.unshift(project);
  await writeStoredProjects(storedProjects);

  return project;
}

interface AddRevisionInput {
  projectId: string;
  title: string;
  description: string;
  changes: string[];
}

export async function addRevision(input: AddRevisionInput) {
  const storedProjects = await readStoredProjects();
  const projectIndex = storedProjects.findIndex((p) => p.id === input.projectId);

  if (projectIndex === -1) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const project = storedProjects[projectIndex];
  const revisionNumber = project.revisions.length + 1;

  const newRevision = {
    id: `rev-${revisionNumber}`,
    title: input.title,
    description: input.description,
    createdAt: "Just now",
    changes: input.changes
  };

  const updatedProject = {
    ...project,
    revisions: [newRevision, ...project.revisions],
    updatedAt: "Updated just now",
    status: "review" as const
  };

  storedProjects[projectIndex] = updatedProject;
  await writeStoredProjects(storedProjects);

  return updatedProject;
}

interface GenerateProjectInput {
  projectId: string;
  clarifyingAnswers?: Record<string, string>;
  client?: AiClient; // injected in tests
}

/**
 * Picks the AI client used by the generation pipeline.
 *
 *   USE_REAL_AI=true  → real Anthropic client (requires ANTHROPIC_API_KEY)
 *   anything else     → deterministic stub (fast, offline, no API cost)
 *
 * Tests can bypass this by passing client: ... into generateProject.
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
  const storedProjects = await readStoredProjects();
  const projectIndex = storedProjects.findIndex((p) => p.id === projectId);
  if (projectIndex === -1) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const project = storedProjects[projectIndex];

  const ai = client ?? selectPipelineClient();

  // Merge prior answers (from persisted state) with the ones passed in now.
  const effectiveAnswers = clarifyingAnswers ?? project.clarifyingAnswers;

  const result = await runGenerationPipeline(ai, {
    prompt: project.prompt,
    constraints: project.constraints,
    preferredParts: [], // TODO wire through from create form when needed
    clarifyingAnswers: effectiveAnswers
  });

  if (result.kind === "paused") {
    // Persist the pause state so the workspace can show the form.
    const paused: ProjectSummary = {
      ...project,
      status: "generating",
      updatedAt: "Updated just now",
      outputs: {
        ...project.outputs,
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
    id: `rev-${project.revisions.length + 1}`,
    title: "AI generation",
    description: "Ran prompt → requirements → architecture → BOM → validation through the AI pipeline.",
    createdAt: "Just now",
    changes: [
      `Produced ${result.requirements.length} requirements`,
      `Generated ${result.architectureBlocks.length}-block architecture`,
      `Selected ${result.bom.length} BOM items`,
      `Flagged ${result.validations.length} validation issues`
    ]
  };

  const updated: ProjectSummary = {
    ...project,
    status: "review",
    updatedAt: "Updated just now",
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
    revisions: [generationRevision, ...project.revisions]
  };

  storedProjects[projectIndex] = updated;
  await writeStoredProjects(storedProjects);
  return updated;
}

interface CreateExportJobInput {
  projectId: string;
  format: "kicad";
}

export async function createExportJob(input: CreateExportJobInput) {
  const storedProjects = await readStoredProjects();
  const projectIndex = storedProjects.findIndex((p) => p.id === input.projectId);

  if (projectIndex === -1) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const project = storedProjects[projectIndex];
  const jobId = `export-${Date.now()}`;

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
  return path.join(getExportsDir(), `${jobId}.zip`);
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
  const storedProjects = await readStoredProjects();
  const projectIndex = storedProjects.findIndex((p) => p.id === projectId);
  if (projectIndex === -1) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const project = storedProjects[projectIndex];
  const jobs = project.exportJobs ?? [];
  const jobIndex = jobs.findIndex((j) => j.id === jobId);
  if (jobIndex === -1) {
    throw new Error(`Export job not found: ${jobId}`);
  }

  // GC old completed exports (keep latest 3 per project) BEFORE running
  // the new one. This keeps disk bounded without throwing away the most
  // recent history the user might still want to re-download.
  const keepJobIds = await gcOldExports(projectId, 3, jobs);
  const retainedJobs = jobs.filter(
    (j) => j.id === jobId || j.status === "pending" || j.status === "running" || keepJobIds.has(j.id)
  );

  // Mark running
  const retainedIndex = retainedJobs.findIndex((j) => j.id === jobId);
  const runningLogs = [...retainedJobs[retainedIndex].logs, "Validating project outputs..."];
  const runningJob = { ...retainedJobs[retainedIndex], status: "running" as const, logs: runningLogs };
  const runningJobs = [...retainedJobs];
  runningJobs[retainedIndex] = runningJob;
  storedProjects[projectIndex] = { ...project, exportJobs: runningJobs };
  await writeStoredProjects(storedProjects);

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

    const outPath = getExportFilePath(jobId);
    await buildKicadExport({
      projectName: project.name,
      bom: project.outputs.bom,
      architectureBlocks,
      outPath
    });

    const latestStored = await readStoredProjects();
    const latestIndex = latestStored.findIndex((p) => p.id === projectId);
    const latestProject = latestStored[latestIndex];
    const latestJobs = latestProject.exportJobs ?? [];
    const latestJobIndex = latestJobs.findIndex((j) => j.id === jobId);
    const latestJob = latestJobs[latestJobIndex];
    const completedJob = {
      ...latestJob,
      status: "completed" as const,
      completedAt: new Date().toISOString(),
      downloadUrl: `/api/exports/${jobId}/download`,
      logs: [
        ...latestJob.logs,
        `Generated ${project.name}.kicad_pro, .kicad_sch, .kicad_sym`,
        `Generated ${project.name}-netlist.xml and ${project.name}-bom.csv`,
        "Packaged into zip and persisted to exports directory"
      ]
    };
    latestJobs[latestJobIndex] = completedJob;
    latestStored[latestIndex] = {
      ...latestProject,
      status: "exported" as const,
      exportJobs: latestJobs
    };
    await writeStoredProjects(latestStored);
    return completedJob;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const latestStored = await readStoredProjects();
    const latestIndex = latestStored.findIndex((p) => p.id === projectId);
    const latestProject = latestStored[latestIndex];
    const latestJobs = latestProject.exportJobs ?? [];
    const latestJobIndex = latestJobs.findIndex((j) => j.id === jobId);
    const latestJob = latestJobs[latestJobIndex];
    const failedJob = {
      ...latestJob,
      status: "failed" as const,
      error: message,
      logs: [...latestJob.logs, `Export failed: ${message}`]
    };
    latestJobs[latestJobIndex] = failedJob;
    latestStored[latestIndex] = { ...latestProject, exportJobs: latestJobs };
    await writeStoredProjects(latestStored);
    return failedJob;
  }
}

export { splitListValue, slugify };
