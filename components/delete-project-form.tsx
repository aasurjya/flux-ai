"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteProjectFormProps {
  projectId: string;
  projectName: string;
  action: (formData: FormData) => void | Promise<void>;
}

/**
 * Small delete-button form with a browser confirm() dialog.
 *
 * Native confirm() keeps this a 1-file addition; swap for a proper
 * modal if + when users ask for undo or multi-select. confirm() is
 * fine for an MVP destructive action — it blocks submission until
 * the user acknowledges.
 */
export function DeleteProjectForm({ projectId, projectName, action }: DeleteProjectFormProps) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      `Delete "${projectName}"? This removes the project, every revision, and any generated KiCad exports. This cannot be undone.`
    );
    if (!ok) e.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="contents">
      <input type="hidden" name="projectId" value={projectId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        aria-label={`Delete project ${projectName}`}
        className="border-transparent bg-transparent text-muted-foreground hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </form>
  );
}
