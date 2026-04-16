"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GenerateStreamingButtonProps {
  projectId: string;
  fallbackAction: (formData: FormData) => Promise<void>;
  isGenerating: boolean;
}

const STAGE_ORDER = ["requirements", "clarify", "architecture", "bom", "validation"] as const;
type StageName = (typeof STAGE_ORDER)[number];
type StageState = "pending" | "running" | "completed" | "error";

const STAGE_LABELS: Record<StageName, string> = {
  requirements: "Parsing requirements",
  clarify: "Checking for ambiguity",
  architecture: "Extracting architecture",
  bom: "Selecting BOM",
  validation: "Validating design"
};

/**
 * Streaming Generate button + live narration panel.
 *
 * Opens an EventSource to /api/projects/[id]/generate-stream, updates
 * per-stage status live ("Parsing requirements ✓ / Extracting
 * architecture…"), and router.refresh() when the stream closes so the
 * server-rendered workspace shows the final state.
 *
 * Graceful fallback: if EventSource fails before any event arrives
 * (corp proxy strips SSE, for example) we submit the classic server
 * action form so users still get to an outcome.
 */
export function GenerateStreamingButton({
  projectId,
  fallbackAction,
  isGenerating
}: GenerateStreamingButtonProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stageStates, setStageStates] = React.useState<Partial<Record<StageName, StageState>>>({});
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    setStageStates({});

    let receivedAnyEvent = false;
    const es = new EventSource(`/api/projects/${projectId}/generate-stream`);

    const close = (refresh: boolean) => {
      es.close();
      setPending(false);
      if (refresh) router.refresh();
    };

    es.addEventListener("stage", (ev) => {
      receivedAnyEvent = true;
      try {
        const msg = JSON.parse((ev as MessageEvent).data) as {
          stage: StageName;
          status: StageState;
        };
        if (STAGE_ORDER.includes(msg.stage)) {
          setStageStates((prev) => ({ ...prev, [msg.stage]: msg.status }));
        }
      } catch {
        /* malformed event — ignore, not fatal */
      }
    });
    es.addEventListener("done", () => {
      close(true);
    });
    es.addEventListener("error", (ev) => {
      const data = (ev as MessageEvent).data;
      if (!receivedAnyEvent) {
        // SSE endpoint unreachable — fall back to plain form action
        close(false);
        formRef.current?.requestSubmit();
        return;
      }
      try {
        const msg = data ? JSON.parse(data) : {};
        setError(msg.message ?? "generation failed");
      } catch {
        setError("generation failed");
      }
      close(true);
    });
  }

  // Only show stages that are doing something; clarify is shown only if
  // it actually fired. Order reflects pipeline order.
  const visibleStages = STAGE_ORDER.filter((s) => stageStates[s] !== undefined);

  return (
    <>
      <form ref={formRef} action={fallbackAction} className="hidden">
        <input type="hidden" name="projectId" value={projectId} />
      </form>
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? "Generating..." : isGenerating ? "Continue generation" : "Generate design"}
      </Button>
      {(pending || error) && visibleStages.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Generation progress"
          className="absolute right-0 top-full z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border/70 bg-card/95 p-3 shadow-lg"
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            AI pipeline
          </p>
          <ul className="space-y-1.5">
            {visibleStages.map((stage) => {
              const status = stageStates[stage];
              return (
                <li key={stage} className="flex items-center gap-2 text-sm">
                  {status === "completed" && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                  )}
                  {status === "running" && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden />
                  )}
                  {status === "error" && (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden />
                  )}
                  <span
                    className={
                      status === "completed"
                        ? "text-foreground"
                        : status === "error"
                          ? "text-rose-300"
                          : "text-muted-foreground"
                    }
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="mt-2 text-xs text-rose-300" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
