"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

interface DismissValidationFormProps {
  projectId: string;
  validationId: string;
  validationTitle: string;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}

/**
 * Two-step dismiss flow: click the × button → reveal a short textarea
 * asking "why?" → submit creates a revision recording the dismissal
 * with the reason, so future reviewers (and the user themselves in
 * three months) know why this warning was silenced.
 *
 * A reason field is non-negotiable — dismissals without a rationale
 * become instant technical debt.
 */
export function DismissValidationForm({
  projectId,
  validationId,
  validationTitle,
  action
}: DismissValidationFormProps) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const result = await action(formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setReason("");
        toast("Validation issue dismissed");
      }
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Dismiss: ${validationTitle}`}
        onClick={() => setOpen(true)}
        className="border-transparent bg-transparent text-muted-foreground hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
      >
        <X className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <form
      action={onSubmit}
      className="mt-3 space-y-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="validationId" value={validationId} />
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`reason-${validationId}`}>
        Reason for accepting this trade-off
      </label>
      <Textarea
        id={`reason-${validationId}`}
        name="reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
        rows={2}
        placeholder="e.g. Dev board only, not user-facing"
        disabled={pending}
        className="text-sm"
      />
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !reason.trim()}>
          {pending ? "Dismissing..." : "Dismiss"}
        </Button>
      </div>
    </form>
  );
}
