import { z } from "zod";
import type { ProjectSummary } from "@/types/project";

/**
 * Zod schema mirror of the ProjectSummary type in types/project.ts.
 *
 * Used when reading projects.json from disk — a corrupt / manually-edited
 * / version-mismatched file could otherwise produce objects with missing
 * fields that crash downstream code. This schema rejects such entries
 * with a clear error instead of papering over nulls with `??` guards.
 *
 * When ProjectSummary changes, this schema MUST change in lockstep —
 * the `_typecheck` export at the bottom is a compile-time tripwire:
 * if the type and schema drift, TypeScript refuses to compile.
 */

const ExportJobStatus = z.enum(["pending", "running", "completed", "failed"]);

const ExportJobSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: ExportJobStatus,
  format: z.literal("kicad"),
  createdAt: z.string().min(1),
  completedAt: z.string().optional(),
  downloadUrl: z.string().optional(),
  logs: z.array(z.string()),
  error: z.string().optional()
});

const ValidationIssueSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string().min(1),
  detail: z.string().min(1)
});

const BomItemSchema = z.object({
  id: z.string().min(1),
  designator: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().min(1),
  package: z.string().min(1),
  status: z.enum(["selected", "alternate", "needs_review"])
});

const ProjectRevisionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  createdAt: z.string().min(1),
  changes: z.array(z.string())
});

const CircuitBlockSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum([
    "power",
    "processing",
    "sensor",
    "interface",
    "storage",
    "analog",
    "protection"
  ]),
  connections: z.array(z.string())
});

export const ProjectSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string(),
  status: z.enum([
    "draft",
    "generating",
    "review",
    "ready_for_export",
    "exporting",
    "exported"
  ]),
  updatedAt: z.string(),
  constraints: z.array(z.string()),
  outputs: z.object({
    requirements: z.array(z.string()),
    architecture: z.array(z.string()),
    architectureBlocks: z.array(CircuitBlockSchema).optional(),
    bom: z.array(BomItemSchema),
    validations: z.array(ValidationIssueSchema),
    exportReady: z.boolean()
  }),
  revisions: z.array(ProjectRevisionSchema),
  exportJobs: z.array(ExportJobSchema).optional(),
  clarifyingQuestions: z.array(z.string()).optional(),
  clarifyingAnswers: z.record(z.string(), z.string()).optional()
});

// Compile-time invariant: the Zod schema output must assign to ProjectSummary.
// If the type and schema drift, TypeScript refuses to compile this file.
export const _typecheck: ProjectSummary = undefined as unknown as z.infer<
  typeof ProjectSummarySchema
>;
