export type ProjectStatus = "draft" | "generating" | "review" | "ready_for_export" | "exporting" | "exported";

export type ExportJobStatus = "pending" | "running" | "completed" | "failed";

export type CircuitBlockKind =
  | "power"
  | "processing"
  | "sensor"
  | "interface"
  | "storage"
  | "analog"
  | "protection";

export interface CircuitBlock {
  id: string;
  label: string;
  kind: CircuitBlockKind;
  connections: string[]; // ids of other blocks this one talks to
}

export interface ExportJob {
  id: string;
  projectId: string;
  status: ExportJobStatus;
  format: "kicad";
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  logs: string[];
  error?: string;
}

export interface ValidationIssue {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  /**
   * User-recorded dismissal. Once set, design-rules will not re-fire
   * this same issue on subsequent runs unless the underlying BOM or
   * architecture changes (rule+title identity is the stability key).
   * Optional for back-compat with existing projects.
   */
  dismissed?: { at: string; reason: string };
}

export interface BomItem {
  id: string;
  designator: string;
  name: string;
  quantity: number;
  package: string;
  status: "selected" | "alternate" | "needs_review";
  /**
   * Canonical electrical value — "100nF", "10k", "5V", "10µF".
   * Optional so legacy projects (pre-Phase-6) still validate.
   * Rules prefer this over regex-on-name when present.
   */
  value?: string;
  /** Manufacturer part number when confident (e.g. "GRM155R71H104KA88D"). */
  mpn?: string;
}

/**
 * Lightweight snapshot of the structured outputs at the moment this
 * revision was created. Used by the compare view to compute a concrete
 * BOM/validation/architecture delta between any two revisions.
 *
 * Optional — older revisions pre-date this field and will simply render
 * as "snapshot unavailable" in the compare UI. Forward-only migration.
 */
export interface RevisionSnapshot {
  bom: BomItem[];
  validations: ValidationIssue[];
  architectureBlocks?: CircuitBlock[];
}

export interface ProjectRevision {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  changes: string[];
  snapshot?: RevisionSnapshot;
}

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  status: ProjectStatus;
  updatedAt: string;
  constraints: string[];
  preferredParts?: string[];
  outputs: {
    requirements: string[];
    architecture: string[];
    architectureBlocks?: CircuitBlock[];
    bom: BomItem[];
    validations: ValidationIssue[];
    exportReady: boolean;
  };
  revisions: ProjectRevision[];
  exportJobs?: ExportJob[];
  clarifyingQuestions?: string[];
  clarifyingAnswers?: Record<string, string>;
}
