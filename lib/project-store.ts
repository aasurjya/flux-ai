import { promises as fs } from "node:fs";
import path from "node:path";
import { mockProjects } from "@/lib/mock-data";
import { ProjectSummary } from "@/types/project";
import type { AiClient } from "@/lib/ai/client";
import { getAiClient } from "@/lib/ai/client";
import { createStubAiClient } from "@/lib/ai/stub-client";
import { runGenerationPipeline } from "@/lib/ai/pipeline";
import { architectureSummary } from "@/lib/ai/generate-architecture";

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

  const job = jobs[jobIndex];

  // Simulate export job progression
  const updatedJob = {
    ...job,
    status: "running" as const,
    logs: [
      ...job.logs,
      "Validating project outputs...",
      "Generating KiCad schematic symbols...",
      "Creating PCB footprint assignments...",
      "Building netlist connections...",
      "Packaging output files..."
    ]
  };

  const updatedJobs = [...jobs];
  updatedJobs[jobIndex] = updatedJob;

  const updatedProject = {
    ...project,
    exportJobs: updatedJobs
  };

  storedProjects[projectIndex] = updatedProject;
  await writeStoredProjects(storedProjects);

  // Simulate completion after a delay (in real implementation, this would be a background job)
  setTimeout(async () => {
    const finalStoredProjects = await readStoredProjects();
    const finalProjectIndex = finalStoredProjects.findIndex((p) => p.id === projectId);
    if (finalProjectIndex === -1) return;

    const finalProject = finalStoredProjects[finalProjectIndex];
    const finalJobs = finalProject.exportJobs ?? [];
    const finalJobIndex = finalJobs.findIndex((j) => j.id === jobId);
    if (finalJobIndex === -1) return;

    const finalJob = finalJobs[finalJobIndex];
    const completedJob = {
      ...finalJob,
      status: "completed" as const,
      completedAt: new Date().toISOString(),
      downloadUrl: `/api/exports/${jobId}/download`,
      logs: [...finalJob.logs, "Export completed successfully!"]
    };

    const finalUpdatedJobs = [...finalJobs];
    finalUpdatedJobs[finalJobIndex] = completedJob;

    finalStoredProjects[finalProjectIndex] = {
      ...finalProject,
      status: "exported" as const,
      exportJobs: finalUpdatedJobs
    };

    await writeStoredProjects(finalStoredProjects);
  }, 2000);

  return updatedJob;
}

export { splitListValue, slugify };
