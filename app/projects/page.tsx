import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Plus } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getProjects, deleteProject, importProject } from "@/lib/project-store";
import { ProjectSummarySchema } from "@/lib/project-schema";
import { mockProjects } from "@/lib/mock-data";
import { ImportProjectForm } from "./import-project-form";

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

async function importProjectAction(formData: FormData): Promise<{ error?: string } | void> {
  "use server";
  const raw = String(formData.get("payload") ?? "");
  if (!raw.trim()) return { error: "Paste a project JSON first" };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { error: "That's not valid JSON — check the file contents" };
  }
  const parsed = ProjectSummarySchema.safeParse(parsedJson);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      error: `Schema mismatch at ${first?.path.join(".") || "(root)"}: ${first?.message ?? "invalid payload"}`
    };
  }
  await importProject(parsed.data);
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
      <div className="mt-8">
        <ImportProjectForm action={importProjectAction} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
