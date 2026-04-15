import { promises as fs } from "node:fs";
import { NextRequest } from "next/server";
import { getExportFilePath } from "@/lib/project-store";

/**
 * GET /api/exports/[jobId]/download
 *
 * Streams the previously-generated .zip for a completed export job.
 * 404 if the zip file doesn't exist. The jobId is used to look up the
 * file on disk; the file is named {jobId}.zip.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    return new Response("Invalid job id", { status: 400 });
  }

  const filePath = getExportFilePath(jobId);
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Response("Export not found", { status: 404 });
    }
    throw error;
  }

  // Defence-in-depth: re-sanitize the filename independently of the
  // regex above. If the regex is ever widened, we don't want a header
  // injection via Content-Disposition. Only [a-z0-9_-] chars survive.
  const safeFilename = `${jobId.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(buffer.length),
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Cache-Control": "private, max-age=0, must-revalidate"
    }
  });
}
