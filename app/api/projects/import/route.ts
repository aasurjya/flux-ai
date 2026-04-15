import { NextRequest } from "next/server";
import { importProject } from "@/lib/project-store";
import { ProjectSummarySchema } from "@/lib/project-schema";

/**
 * POST /api/projects/import
 *
 * Accepts a JSON body matching ProjectSummarySchema (typically from
 * a previously exported .flux.json file) and creates a fresh project
 * from it. Revision ids are regenerated; export jobs are stripped
 * (they reference zip files on another host's disk).
 *
 * - 400 on missing body / invalid schema (with field-level errors)
 * - 413 on bodies > MAX_BYTES
 * - 201 on success with { id } of the imported project
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — imports don't need to be big

export async function POST(request: NextRequest) {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader && Number(lengthHeader) > MAX_BYTES) {
    return Response.json({ error: "Payload too large (max 5 MB)" }, { status: 413 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    // Use UTF-8 byte count, not String.length (which counts UTF-16 code
    // units). A 4-byte Unicode codepoint would otherwise under-count and
    // let a 9.9 MB payload slip past a 5 MB text-length guard.
    const byteLength = Buffer.byteLength(text, "utf8");
    if (byteLength > MAX_BYTES) {
      return Response.json({ error: "Payload too large (max 5 MB)" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ProjectSummarySchema.safeParse(body);
  if (!parsed.success) {
    // Log the FULL Zod detail server-side (for operators), but return
    // only a generic count to the client. Returning path segments would
    // leak internal schema shape (e.g., "revisions.0.snapshot.bom.3.status")
    // to an unauthenticated caller.
    console.warn("[import-route] schema rejection", parsed.error.issues.slice(0, 10));
    return Response.json(
      {
        error: "Imported project does not match the expected schema",
        issueCount: parsed.error.issues.length
      },
      { status: 400 }
    );
  }

  const imported = await importProject(parsed.data);
  return Response.json({ id: imported.id }, { status: 201 });
}
