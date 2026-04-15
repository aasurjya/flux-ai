import { Badge } from "@/components/ui/badge";
import { ProjectStatus } from "@/types/project";

const statusMap: Record<ProjectStatus, { label: string; variant: "default" | "secondary" | "warning" }> = {
  draft: { label: "Draft", variant: "secondary" },
  generating: { label: "Generating", variant: "default" },
  review: { label: "In Review", variant: "warning" },
  ready_for_export: { label: "Ready for Export", variant: "default" },
  exporting: { label: "Exporting", variant: "warning" },
  exported: { label: "Exported", variant: "default" }
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const config = statusMap[status];

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
