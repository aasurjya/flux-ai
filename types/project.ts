export type ProjectStatus = "draft" | "generating" | "review" | "ready_for_export" | "exporting" | "exported";

export type ExportJobStatus = "pending" | "running" | "completed" | "failed";

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
}

export interface BomItem {
  id: string;
  designator: string;
  name: string;
  quantity: number;
  package: string;
  status: "selected" | "alternate" | "needs_review";
}

export interface ProjectRevision {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  changes: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  prompt: string;
  status: ProjectStatus;
  updatedAt: string;
  constraints: string[];
  outputs: {
    requirements: string[];
    architecture: string[];
    bom: BomItem[];
    validations: ValidationIssue[];
    exportReady: boolean;
  };
  revisions: ProjectRevision[];
  exportJobs?: ExportJob[];
}
