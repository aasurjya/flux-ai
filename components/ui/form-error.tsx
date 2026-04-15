"use client";

import { AlertCircle } from "lucide-react";

interface FormErrorProps {
  error?: string;
}

export function FormError({ error }: FormErrorProps) {
  if (!error) return null;

  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <p className="text-sm text-rose-200">{error}</p>
      </div>
    </div>
  );
}
