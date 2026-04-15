"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/ui/form-error";

interface ImportProjectFormProps {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}

/**
 * Paste-based JSON import. Uses native <details> for the collapsible
 * panel — no modal library. Server action handles validation (via
 * ProjectSummarySchema) and returns a structured error for display.
 */
export function ImportProjectForm({ action }: ImportProjectFormProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const detailsRef = React.useRef<HTMLDetailsElement | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const result = await action(formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else {
        // success — close the panel
        if (detailsRef.current) detailsRef.current.open = false;
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <details ref={detailsRef} className="group rounded-xl border border-border/60 bg-card/40 p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
        <Upload className="h-4 w-4" />
        Import project from JSON
      </summary>
      <form action={onSubmit} className="mt-3 space-y-3">
        {error && <FormError error={error} />}
        <Textarea
          name="payload"
          rows={8}
          required
          placeholder="Paste the contents of a .flux.json export here"
          className="font-mono text-xs"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} size="sm">
            {pending ? "Importing..." : "Import"}
          </Button>
        </div>
      </form>
    </details>
  );
}
