import { describe, it, expect } from "vitest";
import { runDesignRules } from "./design-rules";
import type { BomItem, CircuitBlock } from "@/types/project";

/**
 * Structured-field rule tests. These assert the rule engine reads
 * `value` / `mpn` structured fields on BomItem (new in Phase 6) and
 * gracefully falls back to regex-on-name for back-compat with legacy
 * projects that lack the fields.
 *
 * The deliberate pattern: name the part something the regex would MISS
 * (e.g. "0.1µF X7R MLCC 0402") but set `value: "100nF"`. The rule must
 * still pass — structured-field match wins over fragile regex.
 */

function bom(items: Partial<BomItem>[]): BomItem[] {
  return items.map((p, i) => ({
    id: p.id ?? `b${i}`,
    designator: p.designator ?? `U${i + 1}`,
    name: p.name ?? "part",
    quantity: p.quantity ?? 1,
    package: p.package ?? "0402",
    status: p.status ?? "selected",
    value: p.value,
    mpn: p.mpn
  }));
}

const mcu: CircuitBlock = {
  id: "mcu",
  label: "MCU",
  kind: "processing",
  connections: ["pwr"]
};
const pwr: CircuitBlock = {
  id: "pwr",
  label: "3V3 Rail",
  kind: "power",
  connections: ["mcu"]
};
const i2c: CircuitBlock = {
  id: "i2c",
  label: "I²C bus to sensor",
  kind: "interface",
  connections: ["mcu"]
};

describe("DR-DECOUPLING with structured BOM value", () => {
  it("passes when a capacitor has value:100nF even if the name is obtuse", () => {
    const issues = runDesignRules({
      requirements: [],
      architectureBlocks: [mcu, pwr],
      constraints: [],
      bom: bom([
        {
          designator: "C1",
          name: "0.1µF X7R MLCC 0402 50V Generic No Branding", // no "100nF" substring
          value: "100nF",
          package: "0402"
        },
        {
          designator: "C2",
          name: "10µF X7R",
          value: "10uF",
          package: "0805"
        },
        {
          designator: "U1",
          name: "ESP32-S3",
          package: "QFN-56"
        }
      ])
    });

    // Neither missing-decoupling issue should fire
    const missingSmall = issues.find((i) => i.title.includes("100nF decoupling"));
    const missingBulk = issues.find((i) => i.title.includes("bulk decoupling"));
    expect(missingSmall).toBeUndefined();
    expect(missingBulk).toBeUndefined();
  });

  it("fires when only a bulk cap has structured value but no 100nF is declared anywhere", () => {
    const issues = runDesignRules({
      requirements: [],
      architectureBlocks: [mcu, pwr],
      constraints: [],
      bom: bom([
        {
          designator: "C2",
          name: "10µF bulk",
          value: "10uF"
        },
        {
          designator: "U1",
          name: "ESP32",
          package: "QFN"
        }
      ])
    });
    expect(issues.some((i) => i.title.includes("100nF"))).toBe(true);
    expect(issues.some((i) => i.title.includes("bulk"))).toBe(false);
  });

  it("regex fallback still works when value field is absent (legacy project)", () => {
    const issues = runDesignRules({
      requirements: [],
      architectureBlocks: [mcu, pwr],
      constraints: [],
      bom: bom([
        { designator: "C1", name: "100nF ceramic 0402" }, // no value field
        { designator: "C2", name: "10uF tantalum" },
        { designator: "U1", name: "STM32F401" }
      ])
    });
    expect(issues.some((i) => i.title.includes("100nF"))).toBe(false);
    expect(issues.some((i) => i.title.includes("bulk"))).toBe(false);
  });
});

describe("DR-I2C-PULLUP with structured BOM value", () => {
  it("passes when a resistor has value:10k even if the name is generic", () => {
    const issues = runDesignRules({
      requirements: [],
      architectureBlocks: [mcu, pwr, i2c],
      constraints: [],
      bom: bom([
        { designator: "C1", name: "100nF", value: "100nF" },
        { designator: "C2", name: "10uF", value: "10uF" },
        { designator: "R1", name: "chip resistor 0402", value: "10k" },
        { designator: "R2", name: "chip resistor 0402", value: "10k" },
        { designator: "U1", name: "ESP32" }
      ])
    });
    expect(issues.some((i) => i.title.includes("I²C pull-up"))).toBe(false);
  });

  it("fires when resistors exist but with a value too low to serve as I²C pullup", () => {
    const issues = runDesignRules({
      requirements: [],
      architectureBlocks: [mcu, pwr, i2c],
      constraints: [],
      bom: bom([
        { designator: "C1", name: "100nF", value: "100nF" },
        { designator: "C2", name: "10uF", value: "10uF" },
        { designator: "R1", name: "gate resistor", value: "100" }, // 100Ω ≠ pullup
        { designator: "R2", name: "gate resistor", value: "220" },
        { designator: "U1", name: "ESP32" }
      ])
    });
    expect(issues.some((i) => i.title.includes("I²C pull-up"))).toBe(true);
  });

  it("regex fallback: resistor with 10k in name, no value field, still passes", () => {
    const issues = runDesignRules({
      requirements: [],
      architectureBlocks: [mcu, pwr, i2c],
      constraints: [],
      bom: bom([
        { designator: "C1", name: "100nF" },
        { designator: "C2", name: "10uF" },
        { designator: "R1", name: "10k 0402" },
        { designator: "R2", name: "10k 0402" },
        { designator: "U1", name: "ESP32" }
      ])
    });
    expect(issues.some((i) => i.title.includes("I²C pull-up"))).toBe(false);
  });
});
