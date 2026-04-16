import { describe, it, expect, vi } from "vitest";
import { improveDesign } from "./improve-design";
import type { AiClient } from "./client";
import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

function mockClient(callStructured: ReturnType<typeof vi.fn>): AiClient {
  return { callText: vi.fn(), callStructured } as unknown as AiClient;
}

const baseBom: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" }
];
const baseBlocks: CircuitBlock[] = [
  { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3"] },
  { id: "3v3", label: "3V3 Rail", kind: "power", connections: ["mcu"] }
];
const baseValidations: ValidationIssue[] = [
  {
    id: "dr-decoupling-missing-100nf",
    severity: "warning",
    title: "Missing 100nF decoupling capacitors",
    detail: "Need a 100nF ceramic per VDD pin"
  }
];

describe("improveDesign", () => {
  it("applies structured AI suggestions to the BOM", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      summary: "Added decoupling caps per design-rule finding.",
      bomAdditions: [
        {
          designator: "C1",
          name: "100nF X7R ceramic decoupling",
          package: "0402",
          quantity: 4,
          status: "selected",
          rationale: "Resolves DR-DECOUPLING"
        }
      ],
      bomRemovals: []
    });

    const result = await improveDesign(mockClient(callStructured), {
      prompt: "p",
      requirements: ["r"],
      architectureBlocks: baseBlocks,
      bom: baseBom,
      validations: baseValidations,
      constraints: []
    });

    expect(result.summary).toMatch(/decoupling/i);
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    expect(result.nextBom).toHaveLength(baseBom.length + 1);
    const added = result.nextBom.find((b) => b.designator === "C1");
    expect(added).toBeDefined();
    expect(added!.name).toContain("100nF");
  });

  it("applies removals by designator", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      summary: "Removed obsolete LDO variant.",
      bomAdditions: [],
      bomRemovals: [{ designator: "U1", rationale: "Replaced by integrated PMIC" }]
    });

    const result = await improveDesign(mockClient(callStructured), {
      prompt: "p",
      requirements: ["r"],
      architectureBlocks: baseBlocks,
      bom: baseBom,
      validations: [],
      constraints: []
    });

    expect(result.nextBom.find((b) => b.designator === "U1")).toBeUndefined();
  });

  it("replaces an existing BOM row when the AI re-uses a designator with a different name/value", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      summary: "Swap U1 for a better MCU",
      bomAdditions: [
        {
          designator: "U1",
          name: "ESP32-C6 (better radio)",
          package: "Module",
          quantity: 1,
          status: "selected",
          rationale: "Upgraded for Wi-Fi 6 support"
        }
      ],
      bomRemovals: []
    });

    const result = await improveDesign(mockClient(callStructured), {
      prompt: "p",
      requirements: ["r"],
      architectureBlocks: baseBlocks,
      bom: baseBom,
      validations: [],
      constraints: []
    });

    // U1 now points to the new name — the row was replaced, not duplicated
    const u1 = result.nextBom.find((b) => b.designator === "U1");
    expect(u1?.name).toBe("ESP32-C6 (better radio)");
    // Exactly one row with that designator (no duplicate)
    expect(result.nextBom.filter((b) => b.designator === "U1")).toHaveLength(1);
    // Revision carries a single "Replaced" line (not separate add+remove)
    expect(result.changes.some((c) => /^Replaced U1:/.test(c))).toBe(true);
    expect(result.changes.some((c) => c.includes("ESP32-S3"))).toBe(true);
    expect(result.changes.some((c) => c.includes("ESP32-C6"))).toBe(true);
  });

  it("silently skips an addition identical to the existing row (true no-op)", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      summary: "Attempt to re-add U1 unchanged",
      bomAdditions: [
        {
          designator: "U1",
          name: "ESP32-S3", // same as baseBom
          package: "Module", // same
          quantity: 1, // same
          status: "selected", // same
          rationale: "redundant"
        }
      ],
      bomRemovals: []
    });

    const result = await improveDesign(mockClient(callStructured), {
      prompt: "p",
      requirements: ["r"],
      architectureBlocks: baseBlocks,
      bom: baseBom,
      validations: [],
      constraints: []
    });

    // BOM unchanged — same length, same U1
    expect(result.nextBom).toHaveLength(baseBom.length);
    const u1 = result.nextBom.find((b) => b.designator === "U1");
    expect(u1?.name).toBe("ESP32-S3");
    // No "Replaced" or "Added" entry for U1
    expect(result.changes.some((c) => /U1/.test(c))).toBe(false);
  });

  it("produces one change entry per applied addition/removal with the AI rationale", async () => {
    const callStructured = vi.fn().mockResolvedValue({
      summary: "two edits",
      bomAdditions: [
        { designator: "C1", name: "100nF", package: "0402", quantity: 1, status: "selected", rationale: "add-cap-rationale" }
      ],
      bomRemovals: [{ designator: "U1", rationale: "remove-u1-rationale" }]
    });

    const result = await improveDesign(mockClient(callStructured), {
      prompt: "p",
      requirements: ["r"],
      architectureBlocks: baseBlocks,
      bom: baseBom,
      validations: [],
      constraints: []
    });

    expect(result.changes.some((c) => c.includes("add-cap-rationale"))).toBe(true);
    expect(result.changes.some((c) => c.includes("remove-u1-rationale"))).toBe(true);
  });

  it("throws on empty architecture (nothing to improve)", async () => {
    await expect(
      improveDesign(mockClient(vi.fn()), {
        prompt: "p",
        requirements: ["r"],
        architectureBlocks: [],
        bom: baseBom,
        validations: [],
        constraints: []
      })
    ).rejects.toThrow(/architecture/i);
  });
});
