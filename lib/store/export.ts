import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectSummary } from "@/types/project";
import { buildKicadExport } from "@/lib/kicad/bundle";
import { track } from "@/lib/telemetry";
import {
  withStoreLock,
  readStoredProjects,
  writeStoredProjects
} from "@/lib/store/persistence";

interface CreateExportJobInput {
  projectId: string;
  format: "kicad";
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
export function sanitizeErrorMessage(message: string): string {
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
export async function gcOldExports(
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
    if (!failureMessage) void track("export.downloaded");
    return finalJob;
  });
}
