import Link from "next/link";
import { ArrowRight, Layers, ShieldAlert } from "lucide-react";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectSummary } from "@/types/project";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Card className="h-full border-border/60 bg-card/60">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle>{project.name}</CardTitle>
            <CardDescription>{project.prompt}</CardDescription>
          </div>
          <ProjectStatusBadge status={project.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {project.constraints.map((constraint) => (
            <span key={constraint} className="rounded-full border border-border/80 px-3 py-1">
              {constraint}
            </span>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <Layers className="h-4 w-4 text-primary" />
              Architecture Outputs
            </div>
            <p className="text-sm text-muted-foreground">{project.outputs.architecture.length} generated design blocks ready for review.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              Validation Queue
            </div>
            <p className="text-sm text-muted-foreground">{project.outputs.validations.length} validation notes are waiting for confirmation.</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-sm text-muted-foreground">{project.updatedAt}</p>
        <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:opacity-80">
          Open workspace
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}
