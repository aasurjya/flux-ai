import { describe, it, expect } from "vitest";
import { ProjectSummarySchema } from "./project-schema";

function validProject(overrides?: Record<string, unknown>) {
  return {
    id: "test-project",
    name: "Test Board",
    prompt: "ESP32 dev board",
    status: "draft",
    updatedAt: "2026-04-16T00:00:00.000Z",
    constraints: [],
    outputs: {
      requirements: [],
      architecture: [],
      bom: [],
      validations: [],
      exportReady: false
    },
    revisions: [],
    ...overrides
  };
}

describe("ProjectSummarySchema", () => {
  it("accepts a valid minimal project", () => {
    const result = ProjectSummarySchema.safeParse(validProject());
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = ProjectSummarySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty id", () => {
    const result = ProjectSummarySchema.safeParse(validProject({ id: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = ProjectSummarySchema.safeParse(validProject({ name: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects control characters in name", () => {
    const result = ProjectSummarySchema.safeParse(validProject({ name: "test\x00board" }));
    expect(result.success).toBe(false);
  });

  it("allows control characters in prompt (free-text field, not safeStr)", () => {
    // prompt uses z.string().max(TEXT_MAX), NOT safeStr — intentionally
    // permissive since users paste arbitrary text. Control chars are
    // stripped downstream (firmware scaffold, sexp generator).
    const result = ProjectSummarySchema.safeParse(validProject({ prompt: "hello\x07world" }));
    expect(result.success).toBe(true);
  });

  it("rejects invalid status enum values", () => {
    const result = ProjectSummarySchema.safeParse(validProject({ status: "unknown" }));
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["draft", "generating", "review", "ready_for_export", "exporting", "exported"]) {
      const result = ProjectSummarySchema.safeParse(validProject({ status }));
      expect(result.success).toBe(true);
    }
  });

  it("accepts a project with BOM items including optional value/mpn", () => {
    const result = ProjectSummarySchema.safeParse(
      validProject({
        outputs: {
          requirements: [],
          architecture: [],
          bom: [
            {
              id: "bom-1",
              designator: "C1",
              name: "100nF ceramic",
              quantity: 1,
              package: "0402",
              status: "selected",
              value: "100nF",
              mpn: "GRM155R71H104KA88D"
            }
          ],
          validations: [],
          exportReady: false
        }
      })
    );
    expect(result.success).toBe(true);
  });

  it("accepts a project with dismissed validation issues", () => {
    const result = ProjectSummarySchema.safeParse(
      validProject({
        outputs: {
          requirements: [],
          architecture: [],
          bom: [],
          validations: [
            {
              id: "v1",
              severity: "warning",
              title: "Missing decoupling",
              detail: "Add 100nF caps",
              dismissed: {
                at: "2026-04-16T00:00:00.000Z",
                reason: "Dev board only"
              }
            }
          ],
          exportReady: false
        }
      })
    );
    expect(result.success).toBe(true);
  });

  it("rejects arrays exceeding max length (e.g. >200 BOM items)", () => {
    const bigBom = Array.from({ length: 201 }, (_, i) => ({
      id: `b${i}`,
      designator: `U${i}`,
      name: "Part",
      quantity: 1,
      package: "0402",
      status: "selected"
    }));
    const result = ProjectSummarySchema.safeParse(
      validProject({
        outputs: {
          requirements: [],
          architecture: [],
          bom: bigBom,
          validations: [],
          exportReady: false
        }
      })
    );
    expect(result.success).toBe(false);
  });

  it("accepts optional fields being absent (back-compat)", () => {
    const result = ProjectSummarySchema.safeParse(
      validProject({
        // No exportJobs, no clarifyingQuestions, no clarifyingAnswers
        outputs: {
          requirements: [],
          architecture: [],
          // No architectureBlocks (optional)
          bom: [],
          validations: [],
          exportReady: false
        }
      })
    );
    expect(result.success).toBe(true);
  });
});
