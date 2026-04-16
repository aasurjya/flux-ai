import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { generateProject } from "@/lib/project-store";
import type { PipelineStage, StageStatus } from "@/lib/ai/pipeline";

/**
 * GET /api/projects/[id]/generate-stream
 *
 * Server-Sent Events endpoint that runs the AI generation pipeline
 * and narrates progress stage-by-stage. Each stage emits two events:
 *
 *   event: stage
 *   data: { "stage": "requirements", "status": "running" }
 *
 *   event: stage
 *   data: { "stage": "requirements", "status": "completed", "count": 5 }
 *
 * A final `done` or `error` event closes the stream. Clients (browsers)
 * use EventSource; the streaming route drives `AiWorkflowStages` status
 * without needing a full page reload.
 *
 * Falls back to the existing non-streaming route if SSE is unreachable
 * (the client component catches EventSource errors and submits the
 * plain server action instead).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return new Response("Invalid project id", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      const onStage = (
        stage: PipelineStage,
        status: StageStatus,
        detail?: { count?: number; error?: string }
      ) => {
        send("stage", { stage, status, ...detail });
      };

      try {
        const project = await generateProject({ projectId: id, onStage });
        // Revalidate so subsequent full-page navigations see the result.
        // In test envs without a Next static-generation store this throws;
        // that's fine — generation succeeded and the stream should still
        // close cleanly.
        try {
          revalidatePath(`/projects/${id}`);
        } catch {
          /* test env — no request context */
        }
        send("done", { status: project.status });
      } catch (err) {
        const message = err instanceof Error ? err.message : "generation failed";
        send("error", { message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no" // disable nginx buffering
    }
  });
}
