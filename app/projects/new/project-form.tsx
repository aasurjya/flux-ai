"use client";

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

export function ProjectForm({ action }: ProjectFormProps) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && <FormError error={state.error} />}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground" htmlFor="name">
          Project name
        </label>
        <Input id="name" name="name" placeholder="ESP32 wearable sensor hub" required />
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
        />
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
