"use client";

import { Check, Loader2, Circle, AlertCircle } from "lucide-react";

type StageStatus = "pending" | "running" | "completed" | "error";

interface Stage {
  id: string;
  label: string;
  description: string;
  status: StageStatus;
}

interface AiWorkflowStagesProps {
  stages: Stage[];
  currentStage?: string;
}

export function AiWorkflowStages({ stages, currentStage }: AiWorkflowStagesProps) {
  const currentIndex = stages.findIndex((s) => s.id === currentStage);

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-6">
      <h3 className="mb-4 font-medium text-foreground">AI Generation Pipeline</h3>
      <div className="relative">
        {/* Progress line */}
        <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-border" />
        <div
          className="absolute left-4 top-6 w-0.5 bg-primary transition-all duration-500"
          style={{
            height: currentIndex >= 0 ? `${(currentIndex / (stages.length - 1)) * 100}%` : "0%"
          }}
        />

        {/* Stages */}
        <div className="relative space-y-6">
          {stages.map((stage, index) => {
            const isActive = stage.id === currentStage;
            const isCompleted = stage.status === "completed";
            const isRunning = stage.status === "running";
            const isError = stage.status === "error";

            return (
              <div key={stage.id} className="flex items-start gap-4">
                <div
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isCompleted
                      ? "border-primary bg-primary text-primary-foreground"
                      : isRunning
                        ? "border-primary bg-primary/20 text-primary"
                        : isError
                          ? "border-rose-400 bg-rose-400/20 text-rose-400"
                          : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : isRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isError ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`font-medium ${
                        isActive || isCompleted || isError ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {stage.label}
                    </p>
                    {isRunning && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        Running...
                      </span>
                    )}
                    {isError && (
                      <span className="rounded-full bg-rose-400/10 px-2 py-0.5 text-xs text-rose-400">
                        Failed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{stage.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
