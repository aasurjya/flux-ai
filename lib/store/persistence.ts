import { promises as fs } from "node:fs";
import path from "node:path";
import { mockProjects } from "@/lib/mock-data";
import type { ProjectSummary, RevisionSnapshot } from "@/types/project";
import { ProjectSummarySchema } from "@/lib/project-schema";
import { slugify } from "@/lib/utils";

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
export function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = storeLock.then(fn, fn);
  // Detach: errors in one holder must not poison the next waiter
  storeLock = next.catch(() => {
    /* swallow */
  });
  return next;
}

export function getProjectsFilePath(): string {
  return process.env.FLUX_PROJECTS_FILE ?? path.join(process.cwd(), "data", "projects.json");
}

export function isFileNotFoundError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

// In-memory cache: avoids re-reading + re-parsing the JSON file on
// every getProjectById call. Invalidated by writeStoredProjects.
let cachedProjects: ProjectSummary[] | null = null;
let projectIndex: Map<string, number> | null = null;

function buildIndex(projects: ProjectSummary[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (let i = 0; i < projects.length; i++) {
    idx.set(projects[i].id, i);
  }
  return idx;
}

function invalidateCache() {
  cachedProjects = null;
  projectIndex = null;
}

export async function readStoredProjects(): Promise<ProjectSummary[]> {
  if (cachedProjects) return cachedProjects;

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
    cachedProjects = valid;
    projectIndex = buildIndex(valid);
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

export async function writeStoredProjects(projects: ProjectSummary[]) {
  invalidateCache();
  // Atomic write via temp + rename. Avoids truncating the real file
  // mid-write on crash / SIGTERM / out-of-disk.
  const filePath = getProjectsFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const { randomUUID } = await import("node:crypto");
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

export async function getProjects() {
  const storedProjects = await readStoredProjects();

  return [...storedProjects, ...mockProjects];
}

export async function getProjectById(id: string) {
  const storedProjects = await readStoredProjects();

  // O(1) lookup via in-memory index (populated by readStoredProjects)
  if (projectIndex) {
    const idx = projectIndex.get(id);
    if (idx !== undefined) return storedProjects[idx];
  }

  // Fallback: check mock projects (small array, linear scan is fine)
  const mock = mockProjects.find((p) => p.id === id);
  return mock;
}

/** Small helper so every revision that creates a snapshot does it the same way. */
export function snapshotOf(project: ProjectSummary): RevisionSnapshot {
  return {
    bom: project.outputs.bom,
    validations: project.outputs.validations,
    architectureBlocks: project.outputs.architectureBlocks
  };
}

export function splitListValue(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export { slugify };
