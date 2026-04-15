import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { AiWorkflowStages } from "@/components/ai-workflow-stages";
import { ExportJobCard } from "@/components/export-job-card";
import { getProjectById, addRevision, generateProject, createExportJob, runExportJob } from "@/lib/project-store";
import { AnswerQuestionsForm } from "./answer-questions-form";

async function improveDesignAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    throw new Error("Project ID is required");
  }

  await addRevision({
    projectId,
    title: "Design improvement",
    description: "Applied iterative refinement to the project brief and architecture.",
    changes: [
      "Analyzed current requirements and constraints",
      "Identified potential optimizations in the architecture",
      "Added refinement notes for next iteration"
    ]
  });

  revalidatePath(`/projects/${projectId}`);
}

async function generateAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    throw new Error("Project ID is required");
  }

  await generateProject({ projectId });
  revalidatePath(`/projects/${projectId}`);
}

async function answerQuestionsAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    throw new Error("Project ID is required");
  }

  // Collect question/answer pairs from the form
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("question-")) continue;
    const index = key.slice("question-".length);
    const answer = String(formData.get(`answer-${index}`) ?? "").trim();
    if (!answer) continue;
    answers[String(value)] = answer;
  }

  await generateProject({ projectId, clarifyingAnswers: answers });
  revalidatePath(`/projects/${projectId}`);
}

async function exportAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    throw new Error("Project ID is required");
  }

  const { job } = await createExportJob({ projectId, format: "kicad" });
  await runExportJob(projectId, job.id);
  revalidatePath(`/projects/${projectId}`);
}

export default async function ProjectWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    return notFound();
  }

  const currentProject = project;

  return (
    <div className="container py-16">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Workspace" title={currentProject.name} description={currentProject.prompt} />
          <div className="flex items-center gap-3">
            <ProjectStatusBadge status={currentProject.status} />
            {currentProject.status === "draft" && (
              <form action={generateAction} className="contents">
                <input type="hidden" name="projectId" value={currentProject.id} />
                <SubmitButton>Generate design</SubmitButton>
              </form>
            )}
            <form action={exportAction} className="contents">
              <input type="hidden" name="projectId" value={currentProject.id} />
              <SubmitButton variant="outline">Export to KiCad</SubmitButton>
            </form>
            <form action={improveDesignAction} className="contents">
              <input type="hidden" name="projectId" value={currentProject.id} />
              <SubmitButton>Improve design</SubmitButton>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {currentProject.constraints.map((constraint) => (
            <Badge key={constraint} variant="secondary">
              {constraint}
            </Badge>
          ))}
        </div>

        {currentProject.clarifyingQuestions && currentProject.clarifyingQuestions.length > 0 && (
          <AnswerQuestionsForm
            projectId={currentProject.id}
            questions={currentProject.clarifyingQuestions}
            action={answerQuestionsAction}
          />
        )}

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <AiWorkflowStages
              stages={[
                { id: "prompt", label: "Design Prompt", description: "Original hardware description and constraints", status: "completed" },
                { id: "requirements", label: "Requirements", description: "Extracted objectives and design rules", status: currentProject.outputs.requirements.length > 1 ? "completed" : "pending" },
                { id: "architecture", label: "Architecture", description: "System blocks and interconnections", status: currentProject.outputs.architecture.length > 1 ? "completed" : "pending" },
                { id: "bom", label: "BOM Generation", description: "Component selection and package decisions", status: currentProject.outputs.bom.length > 1 ? "completed" : "pending" },
                { id: "validation", label: "Validation", description: "Design rule checks and review items", status: currentProject.outputs.validations.length > 0 ? "completed" : "pending" }
              ]}
              currentStage={currentProject.status === "draft" ? "requirements" : undefined}
            />

            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Requirements summary</CardTitle>
                <CardDescription>Structured understanding extracted from the design brief.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {currentProject.outputs.requirements.map((item) => (
                  <p key={item}>- {item}</p>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Architecture blocks</CardTitle>
                <CardDescription>First-pass planning before detailed schematic generation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {currentProject.outputs.architecture.map((item) => (
                  <div key={item} className="rounded-xl border border-border/70 bg-background/30 p-4">
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Revision history</CardTitle>
                <CardDescription>Every improvement should create a new explainable revision.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentProject.revisions.map((revision) => (
                  <div key={revision.id} className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-foreground">{revision.title}</h3>
                        <p className="text-sm text-muted-foreground">{revision.description}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{revision.createdAt}</p>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      {revision.changes.map((change) => (
                        <p key={change}>- {change}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Starter BOM</CardTitle>
                <CardDescription>Selected and review-required parts for the current revision.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentProject.outputs.bom.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium text-foreground">{item.designator} — {item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Qty {item.quantity} · {item.package}
                        </p>
                      </div>
                      <Badge variant={item.status === "needs_review" ? "warning" : "secondary"}>
                        {item.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Validation issues</CardTitle>
                <CardDescription>Warnings should remain visible until the user resolves or accepts them.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentProject.outputs.validations.map((issue) => (
                  <div key={issue.id} className="rounded-xl border border-border/70 bg-background/30 p-4">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <p className="font-medium text-foreground">{issue.title}</p>
                      <Badge variant={issue.severity === "critical" ? "critical" : issue.severity === "warning" ? "warning" : "secondary"}>
                        {issue.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{issue.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {currentProject.exportJobs && currentProject.exportJobs.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-medium text-foreground">Export jobs</h3>
                {currentProject.exportJobs.map((job) => (
                  <ExportJobCard key={job.id} job={job} />
                ))}
              </div>
            )}

            <Card className="border-primary/20 bg-card/70">
              <CardHeader>
                <CardTitle>Export readiness</CardTitle>
                <CardDescription>KiCad export remains a gated action after review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>- Review BOM items still marked as needs review</p>
                <p>- Resolve or accept current validation warnings</p>
                <p>- Confirm power, programming, and connector decisions</p>
                <p>- Generate KiCad package after revision approval</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
