import { describe, it, expect } from "vitest";
import { carryDismissalsForward } from "./carry-dismissals";
import type { ValidationIssue } from "@/types/project";

const issue = (id: string, title: string, overrides: Partial<ValidationIssue> = {}): ValidationIssue => ({
  id,
  severity: "warning",
  title,
  detail: "d",
  ...overrides
});

describe("carryDismissalsForward", () => {
  it("copies dismissed state from prior issue onto matching new issue (same id)", () => {
    const prior: ValidationIssue[] = [
      issue("dr-decoupling__missing-100nf", "Missing 100nF decoupling", {
        dismissed: { at: "2026-04-16T00:00:00Z", reason: "dev board, accepted" }
      })
    ];
    const next: ValidationIssue[] = [
      issue("dr-decoupling__missing-100nf", "Missing 100nF decoupling")
    ];
    const result = carryDismissalsForward(next, prior);
    expect(result[0].dismissed).toBeDefined();
    expect(result[0].dismissed!.reason).toBe("dev board, accepted");
  });

  it("does not carry forward when prior dismissal doesn't match any new id", () => {
    const prior: ValidationIssue[] = [
      issue("dr-decoupling__missing-bulk", "Missing bulk cap", {
        dismissed: { at: "t", reason: "r" }
      })
    ];
    const next: ValidationIssue[] = [
      issue("dr-i2c-pullup__missing", "Missing I²C pull-ups")
    ];
    const result = carryDismissalsForward(next, prior);
    expect(result[0].dismissed).toBeUndefined();
  });

  it("returns the new issue list unchanged when no prior dismissals exist", () => {
    const next: ValidationIssue[] = [issue("v1", "New")];
    const result = carryDismissalsForward(next, []);
    expect(result).toEqual(next);
  });

  it("does not overwrite an already-dismissed new issue (idempotent)", () => {
    const prior: ValidationIssue[] = [
      issue("v1", "X", {
        dismissed: { at: "old", reason: "old-reason" }
      })
    ];
    const next: ValidationIssue[] = [
      issue("v1", "X", {
        dismissed: { at: "new", reason: "new-reason" }
      })
    ];
    const result = carryDismissalsForward(next, prior);
    // When both have dismissals, the NEW wins (most recent state)
    expect(result[0].dismissed!.reason).toBe("new-reason");
  });

  it("matches also by (rule-slug, title) fallback when ids don't align", () => {
    // DR issue ids are `dr-{rule}__{slug(title)}` — stable across runs
    // unless the rule or title changes. The primary match is by full id;
    // if the id regenerates differently (rare), we still catch matches
    // whose rule-prefix + title match.
    const prior: ValidationIssue[] = [
      issue("dr-decoupling__missing-100nf-decoupling-capacitors", "Missing 100nF decoupling capacitors", {
        dismissed: { at: "t", reason: "accepted" }
      })
    ];
    // Same rule, same title, but uuid differs (hypothetical id churn)
    const next: ValidationIssue[] = [
      issue("dr-decoupling__missing-100nf-decoupling-capacitors-v2", "Missing 100nF decoupling capacitors")
    ];
    const result = carryDismissalsForward(next, prior);
    expect(result[0].dismissed).toBeDefined();
  });
});
