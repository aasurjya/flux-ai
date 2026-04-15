import { promises as fs } from "node:fs";
import path from "node:path";
import { mockProjects } from "@/lib/mock-data";
import { ProjectSummary } from "@/types/project";

interface CreateProjectInput {
  name: string;
  prompt: string;
  constraints: string[];
  preferredParts: string[];
}

const projectsFilePath = path.join(process.cwd(), "data", "projects.json");

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
    const fileContents = await fs.readFile(projectsFilePath, "utf8");
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
  await fs.mkdir(path.dirname(projectsFilePath), { recursive: true });
  await fs.writeFile(projectsFilePath, JSON.stringify(projects, null, 2), "utf8");
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
}

export async function generateProject({ projectId }: GenerateProjectInput) {
  const storedProjects = await readStoredProjects();
  const projectIndex = storedProjects.findIndex((p) => p.id === projectId);

  if (projectIndex === -1) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const project = storedProjects[projectIndex];

  // AI Workflow: Generate structured outputs based on prompt and constraints
  const generatedRequirements = [
    `Extracted objective from prompt: ${project.prompt}`,
    `Design must honor constraints: ${project.constraints.join(", ")}`,
    "Power architecture requires analysis for regulator selection and efficiency",
    "Signal integrity considerations for high-speed interfaces if applicable",
    "Manufacturability review for selected package types and assembly"
  ];

  const generatedArchitecture = [
    "Power Entry: Input protection, filtering, and primary regulation stage",
    "Processing Core: Microcontroller/SoC with required peripherals and memory",
    "Interface Layer: Communication ports, connectors, and level shifters",
    "Sensor/Actuator Integration: Analog frontends, digital sensors, driver circuits"
  ];

  const generatedBom: ProjectSummary["outputs"]["bom"] = project.constraints.includes("Low-cost BOM")
    ? [
        { id: "bom-1", designator: "U1", name: "Cost-optimized MCU", quantity: 1, package: "QFN-32", status: "needs_review" },
        { id: "bom-2", designator: "U2", name: "Integrated PMIC", quantity: 1, package: "QFN-16", status: "needs_review" },
        { id: "bom-3", designator: "J1", name: "USB-C Connector", quantity: 1, package: "SMD", status: "selected" }
      ]
    : [
        { id: "bom-1", designator: "U1", name: "High-performance MCU", quantity: 1, package: "LQFP-64", status: "needs_review" },
        { id: "bom-2", designator: "U2", name: "Discrete PMIC", quantity: 1, package: "QFN-20", status: "needs_review" },
        { id: "bom-3", designator: "J1", name: "USB-C Connector", quantity: 1, package: "SMD", status: "selected" }
      ];

  const generatedValidations: ProjectSummary["outputs"]["validations"] = [
    {
      id: "val-1",
      severity: "warning",
      title: "Verify power budget calculations",
      detail: "Confirm total current draw matches regulator capacity and thermal limits."
    },
    {
      id: "val-2",
      severity: "info",
      title: "Review footprint compatibility",
      detail: "Ensure all selected packages are compatible with intended PCB process capabilities."
    },
    {
      id: "val-3",
      severity: project.constraints.includes("2-layer board") ? "warning" : "info",
      title: "Layer count routing check",
      detail: project.constraints.includes("2-layer board")
        ? "High-speed signals may require careful routing on 2-layer design."
        : "4+ layer design provides good signal integrity and power distribution."
    }
  ];

  const generationRevision = {
    id: `rev-${project.revisions.length + 1}`,
    title: "AI Generation: Complete workflow",
    description: "Ran structured AI pipeline through requirements, architecture, BOM, and validation stages.",
    createdAt: "Just now",
    changes: [
      "Generated structured requirements from design prompt",
      "Created system architecture with block-level organization",
      "Selected initial BOM based on constraints and cost targets",
      "Ran validation checks for power, signal integrity, and manufacturability"
    ]
  };

  const updatedProject: ProjectSummary = {
    ...project,
    status: "review",
    updatedAt: "Updated just now",
    outputs: {
      requirements: generatedRequirements,
      architecture: generatedArchitecture,
      bom: generatedBom,
      validations: generatedValidations,
      exportReady: false
    },
    revisions: [generationRevision, ...project.revisions]
  };

  storedProjects[projectIndex] = updatedProject;
  await writeStoredProjects(storedProjects);

  return updatedProject;
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
