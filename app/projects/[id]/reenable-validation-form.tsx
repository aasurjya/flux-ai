"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReenableValidationFormProps {
  projectId: string;
  validationId: string;
  validationTitle: string;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}

/**
 * One-click re-enable for a dismissed validation. No reason required —
 * re-enabling just restores visibility. The revision still records it.
 */
export function ReenableValidationForm({
  projectId,
  validationId,
  validationTitle,
  action
}: ReenableValidationFormProps) {
  async function onSubmit(formData: FormData) {
    await action(formData);
  }
  return (
    <form action={onSubmit} className="contents">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="validationId" value={validationId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        aria-label={`Re-enable: ${validationTitle}`}
        className="text-xs"
      >
        <RotateCcw className="mr-1 h-3 w-3" />
        Re-enable
      </Button>
    </form>
  );
}
