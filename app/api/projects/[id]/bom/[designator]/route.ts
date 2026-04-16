import { NextRequest } from "next/server";
import { z } from "zod";
import { patchBomItem } from "@/lib/project-store";
import { createRateLimiter } from "@/lib/rate-limit";

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

/**
 * PATCH /api/projects/[id]/bom/[designator]
 *
 * Updates one BOM row in-place without touching the AI pipeline. The
 * designator in the URL is the stable identity key — it cannot be
 * changed by this route (attempting to supply `designator` in the body
 * is silently ignored). Creates a revision documenting the edit.
 *
 * Phase 2 of the approved plan. Replaces the forced round-trip-through-AI
 * that every BOM correction previously required.
 */

// Partial schema mirroring BomItem fields the user is allowed to edit.
// Deliberately omits `id` (stable, auto-assigned) and `designator`
// (the URL is the source of truth for which row).
const BomPatchSchema = z
  .object({
    name: z.string().min(2).max(240).optional(),
    quantity: z.number().int().min(1).max(9999).optional(),
    package: z.string().min(1).max(60).optional(),
    status: z.enum(["selected", "alternate", "needs_review"]).optional(),
    // Phase 6: user may edit or clear the structured value/mpn fields.
    // `null` explicitly removes the field (e.g. user-entered value no
    // longer applies); a non-empty string sets it.
    value: z.union([z.string().min(1).max(40), z.null()]).optional(),
    mpn: z.union([z.string().min(1).max(80), z.null()]).optional()
  })
  .strict() // reject unknown fields including `designator` attempts
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Patch must include at least one field"
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; designator: string }> }
) {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!limiter.check(clientIp)) {
    return Response.json(
      { error: "Too many edit requests. Try again in a minute." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { id, designator } = await params;

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return Response.json({ error: "Invalid project id" }, { status: 400 });
  }
  if (!/^[A-Z][A-Z0-9_-]{0,40}$/.test(designator)) {
    return Response.json({ error: "Invalid designator" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BomPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid patch",
        issues: parsed.error.issues.slice(0, 5).map((i) => i.message)
      },
      { status: 400 }
    );
  }

  try {
    const updated = await patchBomItem({
      projectId: id,
      designator,
      patch: parsed.data
    });

    return Response.json(
      { bom: updated.outputs.bom, revisionCount: updated.revisions.length },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Patch failed";
    if (/not found/i.test(message)) {
      return Response.json({ error: message }, { status: 404 });
    }
    throw err;
  }
}
