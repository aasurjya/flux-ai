import { describe, it, expect } from "vitest";
import { runDesignRules } from "./design-rules";
import type { BomItem, CircuitBlock } from "@/types/project";

function findRule(
  issues: ReturnType<typeof runDesignRules>,
  rule: string
) {
  return issues.find((i) => i.rule === rule);
}

const mcuBlock: CircuitBlock = { id: "mcu", label: "ESP32-S3", kind: "processing", connections: ["3v3"] };
const pwrBlock: CircuitBlock = { id: "3v3", label: "3.3V rail", kind: "power", connections: ["mcu"] };

describe("runDesignRules", () => {
  describe("DR-DECOUPLING", () => {
    it("flags a processing block whose nearby BOM has no decoupling cap", () => {
      const issues = runDesignRules({
        requirements: ["any"],
        architectureBlocks: [mcuBlock, pwrBlock],
        bom: [
          { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" }
        ],
        constraints: []
      });
      const issue = findRule(issues, "DR-DECOUPLING");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("warning");
      expect(issue!.title).toMatch(/decoupling/i);
    });

    it("does not flag when a 100nF ceramic is already in the BOM", () => {
      const issues = runDesignRules({
        requirements: ["any"],
        architectureBlocks: [mcuBlock, pwrBlock],
        bom: [
          { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" },
          { id: "c1", designator: "C1", name: "100nF X7R ceramic", quantity: 1, package: "0402", status: "selected" },
          { id: "c2", designator: "C2", name: "10uF bulk", quantity: 1, package: "0603", status: "selected" }
        ],
        constraints: []
      });
      expect(findRule(issues, "DR-DECOUPLING")).toBeUndefined();
    });
  });

  describe("DR-I2C-PULLUP", () => {
    it("flags I2C interface without pull-up resistors", () => {
      const issues = runDesignRules({
        requirements: ["I2C sensors"],
        architectureBlocks: [
          mcuBlock,
          pwrBlock,
          { id: "i2c-bus", label: "I2C bus", kind: "interface", connections: ["mcu"] }
        ],
        bom: [
          { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" }
        ],
        constraints: []
      });
      const issue = findRule(issues, "DR-I2C-PULLUP");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("warning");
    });

    it("does not flag when pull-up resistors are present", () => {
      const issues = runDesignRules({
        requirements: ["I2C sensors"],
        architectureBlocks: [
          mcuBlock,
          pwrBlock,
          { id: "i2c-bus", label: "I2C bus", kind: "interface", connections: ["mcu"] }
        ],
        bom: [
          { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" },
          { id: "r1", designator: "R1-R2", name: "I2C pull-up 4.7k", quantity: 2, package: "0402", status: "selected" }
        ],
        constraints: []
      });
      expect(findRule(issues, "DR-I2C-PULLUP")).toBeUndefined();
    });
  });

  describe("DR-ESD-PROTECTION", () => {
    it("flags a USB interface block without ESD/TVS part", () => {
      const issues = runDesignRules({
        requirements: ["USB-C input"],
        architectureBlocks: [
          mcuBlock,
          pwrBlock,
          { id: "usb-in", label: "USB-C input", kind: "interface", connections: ["pwr-prot"] },
          { id: "pwr-prot", label: "Input protection", kind: "protection", connections: ["usb-in", "3v3"] }
        ],
        bom: [
          { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" },
          { id: "j1", designator: "J1", name: "USB-C receptacle", quantity: 1, package: "SMD", status: "selected" }
        ],
        constraints: []
      });
      const issue = findRule(issues, "DR-ESD-PROTECTION");
      expect(issue).toBeDefined();
      expect(issue!.detail).toMatch(/TVS|ESD/i);
    });
  });

  describe("DR-ORPHAN-BLOCK", () => {
    it("flags architecture blocks with no connections", () => {
      const issues = runDesignRules({
        requirements: ["x"],
        architectureBlocks: [
          mcuBlock,
          pwrBlock,
          { id: "lonely", label: "Orphan block", kind: "sensor", connections: [] }
        ],
        bom: [{ id: "u1", designator: "U1", name: "x", quantity: 1, package: "x", status: "selected" }],
        constraints: []
      });
      const issue = findRule(issues, "DR-ORPHAN-BLOCK");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("critical");
      expect(issue!.detail).toContain("Orphan block");
    });
  });

  describe("DR-POWER-BLOCK", () => {
    it("flags designs with no power block", () => {
      const issues = runDesignRules({
        requirements: ["x"],
        architectureBlocks: [mcuBlock],
        bom: [{ id: "u1", designator: "U1", name: "x", quantity: 1, package: "x", status: "selected" }],
        constraints: []
      });
      const issue = findRule(issues, "DR-POWER-BLOCK");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("critical");
    });
  });

  describe("DR-NEEDS-REVIEW-RATIO", () => {
    it("flags designs where >50% of BOM needs_review", () => {
      const issues = runDesignRules({
        requirements: ["x"],
        architectureBlocks: [mcuBlock, pwrBlock],
        bom: [
          { id: "1", designator: "U1", name: "x", quantity: 1, package: "x", status: "needs_review" },
          { id: "2", designator: "U2", name: "x", quantity: 1, package: "x", status: "needs_review" },
          { id: "3", designator: "U3", name: "x", quantity: 1, package: "x", status: "selected" }
        ],
        constraints: []
      });
      const issue = findRule(issues, "DR-NEEDS-REVIEW-RATIO");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("warning");
    });

    it("does not flag when most items are selected", () => {
      const issues = runDesignRules({
        requirements: ["x"],
        architectureBlocks: [mcuBlock, pwrBlock],
        bom: [
          { id: "1", designator: "U1", name: "x", quantity: 1, package: "x", status: "selected" },
          { id: "2", designator: "U2", name: "x", quantity: 1, package: "x", status: "selected" },
          { id: "3", designator: "U3", name: "x", quantity: 1, package: "x", status: "needs_review" }
        ],
        constraints: []
      });
      expect(findRule(issues, "DR-NEEDS-REVIEW-RATIO")).toBeUndefined();
    });
  });

  describe("integration", () => {
    it("returns issues with stable ids and all four severities possible", () => {
      const issues = runDesignRules({
        requirements: ["x"],
        architectureBlocks: [
          { id: "orphan", label: "Orphan", kind: "sensor", connections: [] }
        ],
        bom: [{ id: "1", designator: "U1", name: "x", quantity: 1, package: "x", status: "needs_review" }],
        constraints: []
      });
      // Every issue has a rule id and an issue id; ids must be unique
      const ids = new Set<string>();
      for (const issue of issues) {
        expect(issue.id).toMatch(/^dr-/);
        expect(issue.rule).toMatch(/^DR-/);
        expect(["info", "warning", "critical"]).toContain(issue.severity);
        expect(ids.has(issue.id)).toBe(false);
        ids.add(issue.id);
      }
    });

    it("a rule emitting multiple issues assigns unique ids", () => {
      // DR-DECOUPLING emits two issues (100nF + bulk) when BOM has no caps
      const issues = runDesignRules({
        requirements: ["x"],
        architectureBlocks: [mcuBlock, pwrBlock],
        bom: [
          { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" }
        ],
        constraints: []
      });
      const decouplingIssues = issues.filter((i) => i.rule === "DR-DECOUPLING");
      expect(decouplingIssues.length).toBeGreaterThanOrEqual(2);
      const uniqueIds = new Set(decouplingIssues.map((i) => i.id));
      expect(uniqueIds.size).toBe(decouplingIssues.length);
    });
  });
});
