import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { SectionHeading } from "@/components/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { AiWorkflowStages } from "@/components/ai-workflow-stages";
import { CircuitGraph } from "@/components/circuit-graph";
import { ExportJobCard } from "@/components/export-job-card";
import { RevisionCompare } from "@/components/revision-compare";
import { BomEditorRow } from "./bom-editor-row";
import { formatRelative } from "@/lib/format-relative";
import { getProjectById, generateProject, createExportJob, runExportJob, runImproveDesign } from "@/lib/project-store";
import { AnswerQuestionsForm } from "./answer-questions-form";

async function improveDesignAction(formData: FormData) {
  "use server";

  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) {
    throw new Error("Project ID is required");
  }

  // Real AI improvement: reads the current design + open validations,
  // proposes targeted BOM edits (add decoupling, remove contradictions),
  // re-runs deterministic design rules against the new BOM, and records
  // a revision with the rationale for every change.
  await runImproveDesign({ projectId });

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

export default async function ProjectWorkspacePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ compareA?: string; compareB?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const project = await getProjectById(id);

  if (!project) {
    return notFound();
  }

  const currentProject = project;

  // Resolve the compare selection (if any) — both IDs must exist AND
  // both revisions must have snapshots, otherwise fall through silently.
  const revById = new Map(currentProject.revisions.map((r) => [r.id, r]));
  const compareA = search.compareA ? revById.get(search.compareA) : undefined;
  const compareB = search.compareB ? revById.get(search.compareB) : undefined;
  const canCompare = Boolean(compareA && compareB && compareA.id !== compareB.id);
  // Order the pair: older first. `revisions` is prepended newest-first,
  // so lower index = newer. We want older → newer in the diff direction.
  let comparePair: { older: typeof compareA; newer: typeof compareA } | null = null;
  if (canCompare && compareA && compareB) {
    const idxA = currentProject.revisions.findIndex((r) => r.id === compareA.id);
    const idxB = currentProject.revisions.findIndex((r) => r.id === compareB.id);
    // Higher index = older (revisions are prepended newest-first)
    if (idxA > idxB) {
      comparePair = { older: compareA, newer: compareB };
    } else {
      comparePair = { older: compareB, newer: compareA };
    }
  }

  return (
    <div className="container py-16">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading eyebrow="Workspace" title={currentProject.name} description={currentProject.prompt} />
          <div className="flex items-center gap-3">
            <ProjectStatusBadge status={currentProject.status} />
            {(() => {
              // State-derived affordances: only show the actions that make
              // sense for the project's current state. Visual UX audit (see
              // e2e/visual-audit.spec.ts screenshots) flagged these as
              // confusing when always visible on drafts.
              const hasDesign =
                (currentProject.outputs.architectureBlocks?.length ?? 0) > 0;
              const isDraft = currentProject.status === "draft";
              const isGenerating = currentProject.status === "generating";
              const showGenerate = isDraft || isGenerating;

              return (
                <>
                  {showGenerate && (
                    <form action={generateAction} className="contents">
                      <input type="hidden" name="projectId" value={currentProject.id} />
                      <SubmitButton pendingLabel="Generating design...">
                        {isGenerating ? "Continue generation" : "Generate design"}
                      </SubmitButton>
                    </form>
                  )}
                  {hasDesign && (
                    <>
                      <form action={exportAction} className="contents">
                        <input type="hidden" name="projectId" value={currentProject.id} />
                        <SubmitButton variant="outline" pendingLabel="Exporting...">
                          Export to KiCad
                        </SubmitButton>
                      </form>
                      <form action={improveDesignAction} className="contents">
                        <input type="hidden" name="projectId" value={currentProject.id} />
                        <SubmitButton pendingLabel="Improving...">
                          Improve design
                        </SubmitButton>
                      </form>
                    </>
                  )}
                </>
              );
            })()}
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
                <CardDescription>
                  {currentProject.outputs.architectureBlocks &&
                  currentProject.outputs.architectureBlocks.length > 0
                    ? "Block-level view of signal and power flow. Scroll the graph horizontally if it extends off-screen."
                    : "First-pass planning placeholders. Run 'Generate design' to produce the real block graph."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                {currentProject.outputs.architectureBlocks && currentProject.outputs.architectureBlocks.length > 0 ? (
                  <CircuitGraph blocks={currentProject.outputs.architectureBlocks} />
                ) : (
                  currentProject.outputs.architecture.map((item) => (
                    <div key={item} className="rounded-xl border border-border/70 bg-background/30 p-4">
                      {item}
                    </div>
                  ))
                )}
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
                      <div className="min-w-0">
                        <h3 className="break-words font-medium text-foreground">{revision.title}</h3>
                        <p className="break-words text-sm text-muted-foreground">{revision.description}</p>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                        {formatRelative(revision.createdAt)}
                      </p>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                      {revision.changes.map((change, i) => {
                        const isAdd = /^added\b/i.test(change);
                        const isRemove = /^removed\b/i.test(change);
                        const sigil = isAdd ? "+" : isRemove ? "−" : "•";
                        const sigilColor = isAdd
                          ? "text-emerald-400"
                          : isRemove
                          ? "text-rose-400"
                          : "text-muted-foreground";
                        return (
                          <li key={`${revision.id}-change-${i}`} className="flex gap-2 break-words">
                            <span aria-hidden className={`font-mono font-bold ${sigilColor}`}>
                              {sigil}
                            </span>
                            <span className="min-w-0">{change}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Compare panel — available once 2+ revisions exist with snapshots */}
            {currentProject.revisions.length >= 2 && (
              <Card className="border-border/60 bg-card/60">
                <CardHeader>
                  <CardTitle className="text-base">Compare revisions</CardTitle>
                  <CardDescription>
                    Pick two revisions to see the structured BOM, validation, and
                    architecture diff between them.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form method="GET" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1 space-y-1">
                      <label htmlFor="compareA" className="text-xs font-medium text-muted-foreground">
                        Revision A
                      </label>
                      <select
                        id="compareA"
                        name="compareA"
                        defaultValue={search.compareA ?? currentProject.revisions[1]?.id ?? ""}
                        className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm"
                      >
                        {currentProject.revisions.map((r) => (
                          <option key={r.id} value={r.id} disabled={!r.snapshot}>
                            {r.title}
                            {!r.snapshot ? " (no snapshot)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <label htmlFor="compareB" className="text-xs font-medium text-muted-foreground">
                        Revision B
                      </label>
                      <select
                        id="compareB"
                        name="compareB"
                        defaultValue={search.compareB ?? currentProject.revisions[0]?.id ?? ""}
                        className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm"
                      >
                        {currentProject.revisions.map((r) => (
                          <option key={r.id} value={r.id} disabled={!r.snapshot}>
                            {r.title}
                            {!r.snapshot ? " (no snapshot)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" variant="outline" size="sm" className="shrink-0">
                      Compare
                    </Button>
                  </form>
                  {/* User picked the same revision on both sides — give feedback
                      rather than silently hiding the diff panel. */}
                  {compareA && compareB && compareA.id === compareB.id && (
                    <p className="text-sm text-amber-400">
                      Select two different revisions to compare.
                    </p>
                  )}
                  {comparePair && (
                    <RevisionCompare older={comparePair.older!} newer={comparePair.newer!} />
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Starter BOM</CardTitle>
                <CardDescription>
                  Click the pencil on any row to edit name, quantity, package, or status in-place.
                  Each edit creates a new revision.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentProject.outputs.bom.map((item) => (
                  <BomEditorRow key={item.id} projectId={currentProject.id} item={item} />
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
                  <ExportJobCard
                    key={job.id}
                    job={job}
                    retryAction={job.status === "failed" ? exportAction : undefined}
                  />
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
