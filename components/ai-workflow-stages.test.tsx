import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiWorkflowStages } from "./ai-workflow-stages";

const stages = [
  { id: "arch", label: "Architecture", description: "Designing blocks", status: "completed" as const },
  { id: "bom", label: "BOM", description: "Selecting components", status: "running" as const },
  { id: "validate", label: "Validate", description: "Checking design", status: "error" as const },
  { id: "export", label: "Export", description: "Building output", status: "pending" as const },
];

describe("AiWorkflowStages", () => {
  it("renders a check icon for completed stages", () => {
    const html = renderToStaticMarkup(
      <AiWorkflowStages stages={stages} currentStage="bom" />
    );
    // lucide Check icon renders as an svg with a polyline/path — the completed
    // circle container has primary styling
    expect(html).toContain("Architecture");
    expect(html).toContain("border-primary bg-primary");
  });

  it("renders a spinner for running stages", () => {
    const html = renderToStaticMarkup(
      <AiWorkflowStages stages={stages} currentStage="bom" />
    );
    expect(html).toContain("animate-spin");
    expect(html).toContain("Running...");
  });

  it("renders an error icon and badge for error stages", () => {
    const html = renderToStaticMarkup(
      <AiWorkflowStages stages={stages} currentStage="bom" />
    );
    // Error stage should have red/rose styling, not the default gray
    expect(html).toContain("border-rose");
    // Should show an error badge similar to the "Running..." badge
    expect(html).toContain("Failed");
  });

  it("renders a gray circle for pending stages", () => {
    const html = renderToStaticMarkup(
      <AiWorkflowStages stages={stages} currentStage="bom" />
    );
    expect(html).toContain("Export");
    expect(html).toContain("border-border bg-background");
  });

  it("renders all stage labels and descriptions", () => {
    const html = renderToStaticMarkup(
      <AiWorkflowStages stages={stages} currentStage="arch" />
    );
    for (const stage of stages) {
      expect(html).toContain(stage.label);
      expect(html).toContain(stage.description);
    }
  });
});
