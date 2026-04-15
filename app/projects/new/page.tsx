import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SectionHeading } from "@/components/section-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createProject, splitListValue } from "@/lib/project-store";
import { ProjectForm } from "./project-form";

async function createProjectAction(prevState: unknown, formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const prompt = String(formData.get("prompt") ?? "").trim();
  const constraints = splitListValue(String(formData.get("constraints") ?? ""));
  const preferredParts = splitListValue(String(formData.get("parts") ?? ""));

  if (!name || !prompt) {
    return { error: "Project name and design prompt are required" };
  }

  try {
    const project = await createProject({
      name,
      prompt,
      constraints,
      preferredParts
    });

    revalidatePath("/projects");
    redirect(`/projects/${project.id}`);
  } catch {
    return { error: "Failed to create project. Please try again." };
  }
}

export default function NewProjectPage() {
  return (
    <div className="container py-16">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <SectionHeading
            eyebrow="New project"
            title="Start with a hardware prompt"
            description="Describe the electronics goal, constraints, and preferred parts. The system will turn that into a structured project brief and first draft outputs."
          />
          <Card className="border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle>What the MVP will generate</CardTitle>
              <CardDescription>First output set before full backend generation is wired.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>- Requirements summary</p>
              <p>- Architecture blocks</p>
              <p>- Starter BOM suggestions</p>
              <p>- Validation issues and open questions</p>
              <p>- Export readiness checklist</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/20 bg-card/70">
          <CardHeader>
            <CardTitle>Project brief</CardTitle>
            <CardDescription>Save the prompt as a project and open the first working workspace draft.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectForm action={createProjectAction} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
