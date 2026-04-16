import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Local file-based telemetry counters. No network, no external deps.
 *
 * Tracks named events as monotonic counters persisted to a JSON file
 * on disk. Best-effort only — a write failure (disk full, permissions)
 * never throws to the caller. The admin route `/admin/stats` reads
 * these counters to answer "which features are actually being used?"
 *
 * Tracked events (emit from the relevant server action / store fn):
 *   project.created
 *   pipeline.completed
 *   bom.edited
 *   validation.dismissed
 *   export.downloaded
 *   improve.clicked
 */

function getCountersPath(): string {
  const dir = process.env.FLUX_TELEMETRY_DIR ?? path.join(process.cwd(), "data");
  return path.join(dir, "telemetry.json");
}

/**
 * Read all counters from disk. Returns an empty object if the file
 * doesn't exist yet (first boot).
 */
export async function readCounters(): Promise<Record<string, number>> {
  try {
    const raw = await fs.readFile(getCountersPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Increment a named counter by 1. Best-effort — never throws.
 * Creates the directory + file lazily on first call.
 */
export async function track(event: string): Promise<void> {
  try {
    const filePath = getCountersPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const counters = await readCounters();
    const updated = { ...counters, [event]: (counters[event] ?? 0) + 1 };
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf8");
  } catch {
    // Best-effort — telemetry must never break a user flow.
  }
}
