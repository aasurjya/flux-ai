import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Plus } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getProjects, deleteProject } from "@/lib/project-store";
import { mockProjects } from "@/lib/mock-data";

async function deleteProjectAction(formData: FormData) {
  "use server";
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) throw new Error("Project ID is required");
  // Refuse to delete seeded mock projects — they're examples, not user data
  if (mockProjects.some((m) => m.id === projectId)) {
    throw new Error("Cannot delete the sample project");
  }
  await deleteProject(projectId);
  revalidatePath("/projects");
}

export default async function ProjectsPage() {
  const projects = await getProjects();
  const mockIds = new Set(mockProjects.map((m) => m.id));

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
            <ProjectCard
              key={project.id}
              project={project}
              // Mock seeded projects aren't deletable — they're examples
              deleteAction={mockIds.has(project.id) ? undefined : deleteProjectAction}
            />
          ))
        )}
      </div>
    </div>
  );
}
