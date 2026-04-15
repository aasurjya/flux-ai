import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Produce a filesystem- and URL-safe slug from an arbitrary string.
 * Lowercased, non-alphanumerics collapsed to single hyphens, trimmed,
 * length capped. Shared between project-store (project IDs) and
 * design-rules (issue IDs) to avoid divergent implementations.
 */
export function slugify(value: string, maxLength = 48): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}
