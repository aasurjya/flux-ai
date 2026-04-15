import { NextRequest } from "next/server";
import { getProjectById } from "@/lib/project-store";

/**
 * GET /api/projects/[id]/export-json
 *
 * Returns the full ProjectSummary as a downloaded JSON file. Useful
 * for backup, sharing a design outside the app, or moving between
 * installs. The paired import endpoint is at /api/projects/import.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response("Invalid project id", { status: 400 });
  }

  const project = await getProjectById(id);
  if (!project) {
    return new Response("Project not found", { status: 404 });
  }

  // RFC 6266 extended filename form — percent-encoded, unambiguous
  // across clients, future-proof against any suffix changes.
  const safeFilename = `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.flux.json`;
  const contentDisposition = `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(
    safeFilename
  )}`;

  return new Response(JSON.stringify(project, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "private, max-age=0, must-revalidate",
      // Prevents MIME sniffing — important because some older clients
      // might otherwise interpret a crafted JSON payload as HTML.
      "X-Content-Type-Options": "nosniff"
    }
  });
}
