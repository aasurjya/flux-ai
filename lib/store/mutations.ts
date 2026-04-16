import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { mockProjects } from "@/lib/mock-data";
import type { ProjectSummary } from "@/types/project";
import { slugify } from "@/lib/utils";
import { track } from "@/lib/telemetry";
import {
  withStoreLock,
  readStoredProjects,
  writeStoredProjects,
  snapshotOf
} from "@/lib/store/persistence";
import { getExportFilePath } from "@/lib/store/export";

interface CreateProjectInput {
  name: string;
  prompt: string;
  constraints: string[];
  preferredParts: string[];
}

interface AddRevisionInput {
  projectId: string;
  title: string;
  description: string;
  changes: string[];
}

export function buildStarterBom(preferredParts: string[]): ProjectSummary["outputs"]["bom"] {
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

export function buildProjectFromInput(input: CreateProjectInput, existingProjects: ProjectSummary[]): ProjectSummary {
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

  // Build the project shell first (with empty revisions) so we can
  // snapshot its outputs into the initial revision.
  const shell: ProjectSummary = {
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
    revisions: []
  };
  const initialRevision = {
    id: `rev-${randomUUID()}`,
    title: "Initial brief",
    description: "Created from the project prompt and first-pass constraints.",
    createdAt: new Date().toISOString(),
    changes: [
      "Saved the project brief",
      "Created starter architecture blocks",
      "Prepared first review items and BOM placeholders"
    ],
    snapshot: snapshotOf(shell)
  };
  return { ...shell, revisions: [initialRevision] };
}

export async function createProject(input: CreateProjectInput) {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const project = buildProjectFromInput(input, [...storedProjects, ...mockProjects]);
    storedProjects.unshift(project);
    await writeStoredProjects(storedProjects);
    void track("project.created");
    return project;
  });
}

/**
 * Dismiss / re-enable a validation issue. Dismissal is a user-recorded
 * accept of a known trade-off ("no ESD — it's a dev board"). Once
 * dismissed, the deterministic design-rules engine won't re-fire the
 * same rule+title on subsequent runs (carry-dismissals.ts matches by
 * id + (severity, title) fallback). Creates a revision for traceability.
 *
 * reason: null → re-enable (remove dismissal).
 */
export async function setValidationDismissal(input: {
  projectId: string;
  validationId: string;
  reason: string | null;
}): Promise<ProjectSummary> {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const projectIndex = storedProjects.findIndex((p) => p.id === input.projectId);
    if (projectIndex === -1) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const project = storedProjects[projectIndex];
    const idx = project.outputs.validations.findIndex((v) => v.id === input.validationId);
    if (idx === -1) {
      throw new Error(`Validation not found: ${input.validationId}`);
    }
    const before = project.outputs.validations[idx];
    const after =
      input.reason === null
        ? { ...before, dismissed: undefined }
        : {
            ...before,
            dismissed: {
              at: new Date().toISOString(),
              reason: input.reason.trim().slice(0, 400)
            }
          };
    const nextValidations = [...project.outputs.validations];
    nextValidations[idx] = after;

    const changes =
      input.reason === null
        ? [`Re-enabled validation: "${before.title}"`]
        : [`Dismissed validation "${before.title}" — reason: ${input.reason.trim()}`];

    const revision = {
      id: `rev-${randomUUID()}`,
      title:
        input.reason === null
          ? `Re-enabled ${before.severity}: ${before.title.slice(0, 60)}`
          : `Dismissed ${before.severity}: ${before.title.slice(0, 60)}`,
      description: changes[0],
      createdAt: new Date().toISOString(),
      changes,
      snapshot: {
        bom: project.outputs.bom,
        validations: nextValidations,
        architectureBlocks: project.outputs.architectureBlocks
      }
    };

    const updated: ProjectSummary = {
      ...project,
      updatedAt: new Date().toISOString(),
      outputs: { ...project.outputs, validations: nextValidations },
      revisions: [revision, ...project.revisions]
    };
    storedProjects[projectIndex] = updated;
    await writeStoredProjects(storedProjects);
    if (input.reason !== null) void track("validation.dismissed");
    return updated;
  });
}

/**
 * Patch a single BOM row. Used by the inline-edit UI so users don't
 * need to round-trip through the AI for every BOM correction. The
 * designator is the identity key — this function never renames it.
 * Creates a revision explaining the edit, with a snapshot for the
 * compare view.
 */
export async function patchBomItem(input: {
  projectId: string;
  designator: string;
  patch: {
    name?: string;
    quantity?: number;
    package?: string;
    status?: "selected" | "alternate" | "needs_review";
    /** null = clear the field; string = set it; omitted = no change. */
    value?: string | null;
    mpn?: string | null;
  };
}): Promise<ProjectSummary> {
  return withStoreLock(async () => {
    const storedProjects = await readStoredProjects();
    const projectIndex = storedProjects.findIndex((p) => p.id === input.projectId);
    if (projectIndex === -1) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const project = storedProjects[projectIndex];
    const itemIndex = project.outputs.bom.findIndex((b) => b.designator === input.designator);
    if (itemIndex === -1) {
      throw new Error(`BOM item not found: ${input.designator}`);
    }
    const before = project.outputs.bom[itemIndex];
    // Merge: designator + id are preserved; only user-editable fields move.
    // value/mpn use `null = clear, string = set` semantics.
    const applyOptional = (current: string | undefined, next: string | null | undefined) => {
      if (next === undefined) return current === undefined ? {} : { __keep: current };
      if (next === null) return { __clear: true };
      return { __set: next };
    };
    const valueOp = applyOptional(before.value, input.patch.value);
    const mpnOp = applyOptional(before.mpn, input.patch.mpn);
    const after = {
      ...before,
      ...("name" in input.patch ? { name: input.patch.name! } : {}),
      ...("quantity" in input.patch ? { quantity: input.patch.quantity! } : {}),
      ...("package" in input.patch ? { package: input.patch.package! } : {}),
      ...("status" in input.patch ? { status: input.patch.status! } : {}),
      ...("__set" in valueOp ? { value: valueOp.__set } : {}),
      ...("__clear" in valueOp ? { value: undefined } : {}),
      ...("__set" in mpnOp ? { mpn: mpnOp.__set } : {}),
      ...("__clear" in mpnOp ? { mpn: undefined } : {})
    };
    const nextBom = [...project.outputs.bom];
    nextBom[itemIndex] = after;

    // Human-readable diff of what changed for the revision record.
    const changedFields: string[] = [];
    if (input.patch.name !== undefined && before.name !== after.name) {
      changedFields.push(`name: "${before.name}" → "${after.name}"`);
    }
    if (input.patch.quantity !== undefined && before.quantity !== after.quantity) {
      changedFields.push(`quantity: ${before.quantity} → ${after.quantity}`);
    }
    if (input.patch.package !== undefined && before.package !== after.package) {
      changedFields.push(`package: "${before.package}" → "${after.package}"`);
    }
    if (input.patch.status !== undefined && before.status !== after.status) {
      changedFields.push(`status: ${before.status} → ${after.status}`);
    }
    if (input.patch.value !== undefined && before.value !== after.value) {
      changedFields.push(`value: ${JSON.stringify(before.value ?? null)} → ${JSON.stringify(after.value ?? null)}`);
    }
    if (input.patch.mpn !== undefined && before.mpn !== after.mpn) {
      changedFields.push(`mpn: ${JSON.stringify(before.mpn ?? null)} → ${JSON.stringify(after.mpn ?? null)}`);
    }

    const updatedOutputs = { ...project.outputs, bom: nextBom };
    const revision = {
      id: `rev-${randomUUID()}`,
      title: `Edited ${input.designator}`,
      description:
        changedFields.length > 0
          ? `Inline BOM edit: ${changedFields.join("; ")}.`
          : "Inline BOM edit: no field changes (noop).",
      createdAt: new Date().toISOString(),
      changes: changedFields.length > 0 ? changedFields : ["No fields changed"],
      snapshot: {
        bom: nextBom,
        validations: project.outputs.validations,
        architectureBlocks: project.outputs.architectureBlocks
      }
    };

    const updated: ProjectSummary = {
      ...project,
      updatedAt: new Date().toISOString(),
      outputs: updatedOutputs,
      revisions: [revision, ...project.revisions]
    };
    storedProjects[projectIndex] = updated;
    await writeStoredProjects(storedProjects);
    void track("bom.edited");
    return updated;
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
      // Reset status to 'draft' — the source may have been 'exported' or
      // 'exporting' on the origin host, but those states reference zip
      // files that don't exist here. A fresh import starts clean.
      status: "draft",
      updatedAt: new Date().toISOString(),
      outputs: {
        ...source.outputs,
        // Origin's export-readiness isn't transferable across hosts.
        exportReady: false
      },
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
      changes: input.changes,
      // Snapshot captures the outputs at the time of revision so the
      // compare view can diff any two revisions structurally.
      snapshot: snapshotOf(project)
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
