import { describe, it, expect } from "vitest";
import { computeRevisionDiff } from "./revision-diff";
import type { BomItem, CircuitBlock, RevisionSnapshot, ValidationIssue } from "@/types/project";

function bomItem(designator: string, overrides: Partial<BomItem> = {}): BomItem {
  return {
    id: `bom-${designator.toLowerCase()}`,
    designator,
    name: "Generic part",
    quantity: 1,
    package: "0402",
    status: "selected",
    ...overrides
  };
}

function validation(id: string, title = "V"): ValidationIssue {
  return { id, severity: "warning", title, detail: "d" };
}

function block(id: string, overrides: Partial<CircuitBlock> = {}): CircuitBlock {
  return { id, label: id.toUpperCase(), kind: "processing", connections: [], ...overrides };
}

function snap(partial: Partial<RevisionSnapshot> = {}): RevisionSnapshot {
  return { bom: [], validations: [], architectureBlocks: [], ...partial };
}

describe("computeRevisionDiff", () => {
  it("returns an empty diff when snapshots are identical", () => {
    const s = snap({
      bom: [bomItem("U1"), bomItem("C1")],
      validations: [validation("v1")],
      architectureBlocks: [block("mcu")]
    });
    const diff = computeRevisionDiff(s, s);
    expect(diff.bom.added).toHaveLength(0);
    expect(diff.bom.removed).toHaveLength(0);
    expect(diff.bom.changed).toHaveLength(0);
    expect(diff.validations.resolved).toHaveLength(0);
    expect(diff.validations.introduced).toHaveLength(0);
    expect(diff.blocks.added).toHaveLength(0);
    expect(diff.blocks.removed).toHaveLength(0);
  });

  it("detects BOM additions by designator", () => {
    const older = snap({ bom: [bomItem("U1")] });
    const newer = snap({ bom: [bomItem("U1"), bomItem("C1", { name: "100nF" })] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.bom.added.map((b) => b.designator)).toEqual(["C1"]);
    expect(diff.bom.removed).toHaveLength(0);
  });

  it("detects BOM removals by designator", () => {
    const older = snap({ bom: [bomItem("U1"), bomItem("U2")] });
    const newer = snap({ bom: [bomItem("U1")] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.bom.removed.map((b) => b.designator)).toEqual(["U2"]);
    expect(diff.bom.added).toHaveLength(0);
  });

  it("detects BOM changes when name or package differs under the same designator", () => {
    const older = snap({ bom: [bomItem("U1", { name: "Old MCU", package: "QFN-32" })] });
    const newer = snap({ bom: [bomItem("U1", { name: "New MCU", package: "QFN-48" })] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.bom.changed).toHaveLength(1);
    expect(diff.bom.changed[0].designator).toBe("U1");
    expect(diff.bom.changed[0].before.name).toBe("Old MCU");
    expect(diff.bom.changed[0].after.name).toBe("New MCU");
  });

  it("does NOT flag a change when BOM entry has only a different id but same everything else", () => {
    // Test the stable-match behaviour: we match by designator, and if
    // everything non-id is identical we treat as unchanged
    const older = snap({ bom: [bomItem("U1", { id: "bom-old" })] });
    const newer = snap({ bom: [bomItem("U1", { id: "bom-new" })] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.bom.changed).toHaveLength(0);
    expect(diff.bom.added).toHaveLength(0);
    expect(diff.bom.removed).toHaveLength(0);
  });

  it("detects validations resolved (in older but not newer)", () => {
    const older = snap({ validations: [validation("v1"), validation("v2")] });
    const newer = snap({ validations: [validation("v1")] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.validations.resolved.map((v) => v.id)).toEqual(["v2"]);
    expect(diff.validations.introduced).toHaveLength(0);
  });

  it("detects validations introduced (in newer but not older)", () => {
    const older = snap({ validations: [] });
    const newer = snap({ validations: [validation("v1")] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.validations.introduced.map((v) => v.id)).toEqual(["v1"]);
    expect(diff.validations.resolved).toHaveLength(0);
  });

  it("detects architecture block additions and removals", () => {
    const older = snap({ architectureBlocks: [block("mcu"), block("imu")] });
    const newer = snap({ architectureBlocks: [block("mcu"), block("led")] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.blocks.added.map((b) => b.id)).toEqual(["led"]);
    expect(diff.blocks.removed.map((b) => b.id)).toEqual(["imu"]);
  });

  it("handles architectureBlocks being undefined on either side (legacy data)", () => {
    const older = snap({ architectureBlocks: undefined });
    const newer = snap({ architectureBlocks: [block("mcu")] });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.blocks.added.map((b) => b.id)).toEqual(["mcu"]);
    expect(diff.blocks.removed).toHaveLength(0);
  });

  it("counts totals for quick UI summary", () => {
    const older = snap({
      bom: [bomItem("U1"), bomItem("U2")],
      validations: [validation("v1"), validation("v2")],
      architectureBlocks: [block("a")]
    });
    const newer = snap({
      bom: [bomItem("U1"), bomItem("C1")],
      validations: [validation("v2"), validation("v3")],
      architectureBlocks: [block("a"), block("b")]
    });
    const diff = computeRevisionDiff(older, newer);
    expect(diff.totalChanges).toBe(
      diff.bom.added.length +
        diff.bom.removed.length +
        diff.bom.changed.length +
        diff.validations.resolved.length +
        diff.validations.introduced.length +
        diff.blocks.added.length +
        diff.blocks.removed.length
    );
    expect(diff.totalChanges).toBeGreaterThanOrEqual(4);
  });
});
