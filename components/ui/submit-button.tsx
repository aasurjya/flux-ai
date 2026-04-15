"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, ButtonProps } from "@/components/ui/button";

interface SubmitButtonProps extends ButtonProps {
  children: React.ReactNode;
  /**
   * Action-specific label shown while the form is submitting. Defaults
   * to "Working..." but buttons like Generate/Export/Improve benefit
   * from specific language ("Generating design...", "Exporting...")
   * because the server action can take several seconds.
   */
  pendingLabel?: React.ReactNode;
}

export function SubmitButton({ children, pendingLabel, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {pendingLabel ?? "Working..."}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
