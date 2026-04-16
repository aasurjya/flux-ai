"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormError } from "@/components/ui/form-error";

interface ProjectFormProps {
  action: (prevState: unknown, formData: FormData) => Promise<{ error: string } | void>;
}

function validateField(name: string, value: string): string | null {
  if (name === "name" && value.length > 0 && value.length < 2) {
    return "Name must be at least 2 characters";
  }
  if (name === "prompt" && value.length > 0 && value.length < 10) {
    return "Prompt must be at least 10 characters";
  }
  return null;
}

export function ProjectForm({ action }: ProjectFormProps) {
  const [state, formAction] = useActionState(action, undefined);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string | null>>({});

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && <FormError error={state.error} />}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="name">
          Project name
        </label>
        <Input
          id="name"
          name="name"
          placeholder="ESP32 wearable sensor hub"
          required
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
          onBlur={(e) =>
            setFieldErrors((prev) => ({ ...prev, name: validateField("name", e.target.value) }))
          }
        />
        {fieldErrors.name && (
          <p id="name-error" className="text-xs text-rose-400">{fieldErrors.name}</p>
        )}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="prompt">
          Design prompt
        </label>
        <Textarea
          id="prompt"
          name="prompt"
          placeholder="Design a battery-powered ESP32-S3 board with USB-C charging, IMU over I2C, status LEDs, and a compact 2-layer layout target."
          required
          aria-describedby={fieldErrors.prompt ? "prompt-error" : undefined}
          onBlur={(e) =>
            setFieldErrors((prev) => ({ ...prev, prompt: validateField("prompt", e.target.value) }))
          }
        />
        {fieldErrors.prompt && (
          <p id="prompt-error" className="text-xs text-rose-400">{fieldErrors.prompt}</p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="constraints">
            Constraints
          </label>
          <Input id="constraints" name="constraints" placeholder="2-layer, low-cost BOM, USB-C input" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="parts">
            Preferred components
          </label>
          <Input id="parts" name="parts" placeholder="ESP32-S3, BQ24074, ICM-42688-P" />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Next step: save this brief as a project and generate revision 1.</p>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/projects">Cancel</Link>
          </Button>
          <SubmitButton>
            Continue to workspace
            <ChevronRight className="ml-2 h-4 w-4" />
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
