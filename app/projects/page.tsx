import Link from "next/link";
import { Plus } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getProjects } from "@/lib/project-store";

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="container py-16">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading
          eyebrow="Projects"
          title="AI-assisted hardware workspaces"
          description="Browse current design workspaces, review generated revisions, and continue improving project outputs before KiCad export."
        />
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New project
          </Link>
        </Button>
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {projects.length === 0 ? (
          <div className="lg:col-span-2">
            <EmptyState />
          </div>
        ) : (
          projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))
        )}
      </div>
    </div>
  );
}
