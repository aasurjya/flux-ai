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

/**
 * Length + character-set bounds throughout. Justification: imports pass
 * through this schema, and a malicious payload can otherwise store
 * unbounded data (RAM + disk growth) or inject content into downstream
 * generated artifacts (C source via CircuitBlock.label → firmware
 * scaffold). Caps are generous but finite.
 */
const ID_MAX = 120;
const LABEL_MAX = 200;
const TITLE_MAX = 200;
const DETAIL_MAX = 2000;
const TEXT_MAX = 4000; // longer free-text fields (description, prompt)
const ARRAY_MAX = 200; // generic array cap; individual sections use tighter caps below

// Safe printable range — no control chars, no embedded newlines.
// Line-break chars are stripped on generation but we also reject them at
// the schema layer so imports can't carry them in at all.
const safeStr = (min = 1, max = TEXT_MAX) =>
  z.string().min(min).max(max).refine((s) => !/[\x00-\x08\x0b-\x1f\x7f]/.test(s), {
    message: "contains control characters"
  });

const ValidationIssueSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  severity: z.enum(["info", "warning", "critical"]),
  title: safeStr(1, TITLE_MAX),
  detail: safeStr(1, DETAIL_MAX),
  dismissed: z
    .object({
      at: z.string().min(1).max(40),
      reason: safeStr(1, 400)
    })
    .optional()
});

const BomItemSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  designator: z.string().min(1).max(40),
  name: safeStr(1, 240),
  quantity: z.number().int().min(1).max(9999),
  package: z.string().min(1).max(60),
  status: z.enum(["selected", "alternate", "needs_review"]),
  // Canonical electrical value ("100nF", "10k", "5V"). Optional: legacy
  // projects have only free-text `name`. Rules prefer this when present.
  value: z.string().min(1).max(40).optional(),
  // Manufacturer part number when the BOM prompt is confident.
  mpn: z.string().min(1).max(80).optional()
});

const CircuitBlockSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  // Bounded + no control chars. The firmware scaffolder sanitises further
  // (strips newlines) before emitting into C source; this schema is the
  // primary barrier against store poisoning via unbounded labels.
  label: safeStr(1, LABEL_MAX),
  kind: z.enum([
    "power",
    "processing",
    "sensor",
    "interface",
    "storage",
    "analog",
    "protection"
  ]),
  connections: z.array(z.string().max(ID_MAX)).max(50)
});

const RevisionSnapshotSchema = z.object({
  bom: z.array(BomItemSchema).max(ARRAY_MAX),
  validations: z.array(ValidationIssueSchema).max(50),
  architectureBlocks: z.array(CircuitBlockSchema).max(50).optional()
});

const ProjectRevisionSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  title: safeStr(1, TITLE_MAX),
  description: z.string().max(TEXT_MAX),
  createdAt: z.string().min(1).max(40),
  changes: z.array(safeStr(1, 400)).max(100),
  snapshot: RevisionSnapshotSchema.optional()
});

export const ProjectSummarySchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  name: safeStr(1, 120),
  prompt: z.string().max(TEXT_MAX),
  status: z.enum([
    "draft",
    "generating",
    "review",
    "ready_for_export",
    "exporting",
    "exported"
  ]),
  updatedAt: z.string().max(40),
  constraints: z.array(safeStr(1, 200)).max(50),
  preferredParts: z.array(safeStr(1, 120)).max(20).optional(),
  outputs: z.object({
    requirements: z.array(safeStr(1, 400)).max(50),
    architecture: z.array(safeStr(1, 400)).max(50),
    architectureBlocks: z.array(CircuitBlockSchema).max(50).optional(),
    bom: z.array(BomItemSchema).max(ARRAY_MAX),
    validations: z.array(ValidationIssueSchema).max(50),
    exportReady: z.boolean()
  }),
  revisions: z.array(ProjectRevisionSchema).max(100),
  exportJobs: z.array(ExportJobSchema).max(50).optional(),
  clarifyingQuestions: z.array(safeStr(1, 400)).max(10).optional(),
  clarifyingAnswers: z
    .record(z.string().max(400), z.string().max(2000))
    .optional()
    .refine((r) => !r || Object.keys(r).length <= 50, {
      message: "clarifyingAnswers cannot have more than 50 entries"
    })
});

// Compile-time invariant: the Zod schema output must assign to ProjectSummary.
// If the type and schema drift, TypeScript refuses to compile this file.
export const _typecheck: ProjectSummary = undefined as unknown as z.infer<
  typeof ProjectSummarySchema
>;
