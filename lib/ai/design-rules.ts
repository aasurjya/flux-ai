import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

/**
 * Deterministic design-rule checks.
 *
 * These rules encode universal hardware-engineering practice drawn from
 * real schematic review checklists (Espressif, Microchip, Infineon).
 * They run alongside the LLM validator and catch the same mistakes
 * experienced engineers spot in 30 seconds of review — without needing
 * an API key or hoping the LLM noticed.
 *
 * Rule ID convention: DR-<SHORT-NAME>. Each rule emits zero or more
 * ValidationIssue objects with a `rule` field so the UI can explain
 * *which* rule fired (not just "something is wrong").
 */

export interface DesignRuleContext {
  requirements: string[];
  architectureBlocks: CircuitBlock[];
  bom: BomItem[];
  constraints: string[];
}

export interface DesignRuleIssue extends ValidationIssue {
  rule: string;
}

type Rule = (ctx: DesignRuleContext) => DesignRuleIssue[];

// ─── Helpers ────────────────────────────────────────────────────────────

function bomContains(bom: BomItem[], patterns: RegExp[]): boolean {
  return bom.some((item) =>
    patterns.some((re) => re.test(item.name) || re.test(item.designator))
  );
}

function architectureHas(blocks: CircuitBlock[], patterns: RegExp[]): boolean {
  return blocks.some((b) =>
    patterns.some((re) => re.test(b.id) || re.test(b.label))
  );
}

import { slugify } from "@/lib/utils";

/**
 * Build a stable id from rule + title so a rule emitting multiple issues
 * (e.g. DR-DECOUPLING emits one for missing 100nF and one for missing
 * bulk) still has unique ids. Previously they collided under the rule
 * name alone, which produced duplicate-key React warnings.
 */
function issue(partial: Omit<DesignRuleIssue, "id">): DesignRuleIssue {
  return {
    id: `${slugify(partial.rule)}__${slugify(partial.title)}`,
    ...partial
  };
}

// ─── Rules ──────────────────────────────────────────────────────────────

/**
 * DR-DECOUPLING: every processing/interface IC should have decoupling caps.
 * We check for a 100nF ceramic AND a bulk cap (>=10uF) somewhere in the BOM.
 * Not perfect (doesn't verify per-pin), but catches the common case of
 * "forgot decoupling entirely" which is the #1 failure mode.
 */
const decouplingCapsRule: Rule = ({ architectureBlocks, bom }) => {
  const hasActiveIcs = architectureBlocks.some((b) =>
    ["processing", "interface", "analog", "sensor"].includes(b.kind)
  );
  if (!hasActiveIcs) return [];

  const hasSmallCeramic = bomContains(bom, [
    /\b(?:100 ?n|0\.1 ?u|0\.1 ?µ)f/i,
    /100\s*nF/i
  ]);
  const hasBulkCap = bomContains(bom, [
    /\b(?:[1-9]\d?\s*|10\s*)uF/i,
    /\b(?:[1-9]\d?\s*|10\s*)µF/i,
    /bulk/i,
    /tantalum/i
  ]);

  const out: DesignRuleIssue[] = [];
  if (!hasSmallCeramic) {
    out.push(
      issue({
        rule: "DR-DECOUPLING",
        severity: "warning",
        title: "Missing 100nF decoupling capacitors",
        detail:
          "Every IC power pin needs a 100nF (0.1µF) ceramic capacitor placed within 3mm. The BOM does not include a 100nF ceramic — add one per active supply pin."
      })
    );
  }
  if (!hasBulkCap) {
    out.push(
      issue({
        rule: "DR-DECOUPLING",
        severity: "warning",
        title: "Missing bulk decoupling capacitor",
        detail:
          "Each active IC typically needs a ~10µF bulk capacitor as a low-impedance energy reservoir alongside the 100nF ceramic. The BOM has no bulk cap listed."
      })
    );
  }
  return out;
};

/**
 * DR-I2C-PULLUP: if architecture includes an I²C interface, the BOM must
 * have pull-up resistors (4.7k–10k on SDA and SCL).
 */
const i2cPullupRule: Rule = ({ architectureBlocks, bom }) => {
  const hasI2c = architectureHas(architectureBlocks, [/i2c/i, /i²c/i]);
  if (!hasI2c) return [];

  const hasPullup = bomContains(bom, [
    /pull[- ]?up/i,
    /\b(?:4\.7|4k7|10) ?k/i
  ]);
  if (hasPullup) return [];

  return [
    issue({
      rule: "DR-I2C-PULLUP",
      severity: "warning",
      title: "Missing I²C pull-up resistors",
      detail:
        "I²C SDA and SCL lines need external pull-ups (typically 4.7k–10k to VDD). The BOM does not list any pull-up resistors. Add R-SDA and R-SCL."
    })
  ];
};

/**
 * DR-ESD-PROTECTION: external connectors should have TVS / ESD protection.
 * We scan for user-exposed interfaces specifically — debug/programming
 * headers are internal (engineer-facing, not user-touchable) so we do
 * NOT flag them. Only USB, Ethernet, antenna, audio, DC jacks count.
 */
const esdProtectionRule: Rule = ({ architectureBlocks, bom }) => {
  const hasExternalInterface = architectureBlocks.some((b) => {
    if (b.kind !== "interface") return false;
    const text = (b.label + " " + b.id).toLowerCase();
    // Debug/programming headers are NOT externally exposed in normal use.
    if (/\b(swd|jtag|isp|debug|programming|uart\s*header|prog)\b/.test(text)) {
      return false;
    }
    return /usb|ethernet|rj45|antenna|audio|jack|type[- ]?c|micro[- ]?b/.test(text);
  });
  if (!hasExternalInterface) return [];

  const hasEsd = bomContains(bom, [
    /\bESD\b/i,
    /\bTVS\b/i,
    /transient\s+voltage/i,
    /\bESDA/i,
    /usblc6/i,
    /pesd/i
  ]);
  if (hasEsd) return [];

  return [
    issue({
      rule: "DR-ESD-PROTECTION",
      severity: "warning",
      title: "No ESD/TVS protection on external connectors",
      detail:
        "Externally accessible connections (USB, Ethernet, antenna, audio) can be destroyed by ESD from user touch or cable insertion. Add a TVS diode array (e.g. PESD3V3, USBLC6, ESDA5V3L) near each external connector."
    })
  ];
};

/**
 * DR-PROGRAMMING-HEADER: every design with a processing block should
 * expose a programming/debug interface so the board can receive firmware.
 * We look for a SWD/JTAG/ISP/UART-header block OR a USB-to-UART bridge
 * IC in the BOM. Missing this is a bench-test killer.
 */
const programmingHeaderRule: Rule = ({ architectureBlocks, bom }) => {
  const hasProcessing = architectureBlocks.some((b) => b.kind === "processing");
  if (!hasProcessing) return [];

  const archHasProgramming = architectureBlocks.some((b) => {
    const text = (b.label + " " + b.id).toLowerCase();
    return /\b(swd|jtag|isp|debug|programming|uart[- ]?header|prog)\b/.test(text);
  });
  const bomHasBridge = bomContains(bom, [
    /\bCP210[0-9]/i,
    /\bCH340/i,
    /\bFT23[0-9]/i,
    /\bCP21[0-9]/i,
    /usb[- ]?to[- ]?uart/i,
    /usb[- ]?serial/i
  ]);
  // ESP32 / ESP8266 / RP2040 have built-in USB bootloaders so don't need
  // an external SWD header or USB-UART bridge to flash. Other MCUs
  // (STM32, AVR, PIC, …) do need one.
  const mcuSelfsProgrammable = bom.some((item) =>
    /\besp32\b|\besp8266\b|\brp2040\b/i.test(item.name)
  );
  if (archHasProgramming || bomHasBridge || mcuSelfsProgrammable) return [];

  return [
    issue({
      rule: "DR-PROGRAMMING-HEADER",
      severity: "warning",
      title: "No visible programming interface",
      detail:
        "Every processor block needs a way to load firmware. Add a SWD/JTAG/UART header block or a USB-to-UART bridge IC (e.g. CP2102, CH340) so the board can be flashed without removing the MCU."
    })
  ];
};

/**
 * DR-RESET-NETWORK: MCUs that expose a RESET pin typically need a
 * pull-up + small filter cap on that pin. Missing this causes random
 * resets or failure to start. Only flagged when there's a processing
 * block AND the BOM doesn't already contain reset-style components.
 *
 * This is a conservative check — many modern MCUs have internal reset
 * circuits and strong recommendations in their datasheets, but we
 * can't inspect package pinouts, so we only warn when there's zero
 * reset-related BOM content.
 */
const resetNetworkRule: Rule = ({ architectureBlocks, bom }) => {
  const hasProcessing = architectureBlocks.some((b) => b.kind === "processing");
  if (!hasProcessing) return [];

  // If the BOM mentions RST, reset, or MCLR explicitly, assume it's
  // already designed in and don't flag.
  const hasReset = bomContains(bom, [/\breset\b/i, /\brst\b/i, /\bMCLR/i]);
  if (hasReset) return [];

  // Also skip MCUs known to ship with robust internal reset (ESP32-S3 etc)
  const mcuWithInternalReset = bom.some((item) =>
    /esp32-s[23]|esp8266|rp2040/i.test(item.name)
  );
  if (mcuWithInternalReset) return [];

  return [
    issue({
      rule: "DR-RESET-NETWORK",
      severity: "info",
      title: "No explicit reset network in BOM",
      detail:
        "If the selected MCU lacks a robust internal reset, add a pull-up (~10kΩ) on the RESET pin plus a small noise filter cap (e.g. 100nF) to prevent spurious resets. Verify against the datasheet."
    })
  ];
};

/**
 * DR-ORPHAN-BLOCK: every architecture block must connect to at least one
 * other block. Orphans indicate an AI-generated graph that dropped a
 * connection — the block is unreachable.
 */
const orphanBlockRule: Rule = ({ architectureBlocks }) => {
  const incomingCount = new Map<string, number>();
  for (const b of architectureBlocks) {
    for (const target of b.connections) {
      incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
    }
  }
  const orphans = architectureBlocks.filter(
    (b) => b.connections.length === 0 && (incomingCount.get(b.id) ?? 0) === 0
  );
  return orphans.map((b) =>
    issue({
      rule: "DR-ORPHAN-BLOCK",
      severity: "critical",
      title: `Orphan block: ${b.label}`,
      detail: `Block '${b.label}' (id=${b.id}) has no connections to any other block. Either connect it or remove it — an unreachable block in the design is almost always a bug.`
    })
  );
};

/**
 * DR-POWER-BLOCK: every design needs at least one power block. A design
 * without a power entry/regulator is either a sub-module with power
 * assumed external (rare for full projects) or a bug.
 */
const powerBlockRule: Rule = ({ architectureBlocks }) => {
  const hasPower = architectureBlocks.some((b) => b.kind === "power");
  if (hasPower) return [];
  return [
    issue({
      rule: "DR-POWER-BLOCK",
      severity: "critical",
      title: "No power block in architecture",
      detail:
        "Every PCB design needs at least one power block (regulator, PMIC, or bus converter). The generated architecture has none — check whether the design is meant to be externally powered or whether a regulator was missed."
    })
  ];
};

/**
 * DR-NEEDS-REVIEW-RATIO: if more than half the BOM is 'needs_review',
 * the design is too underspecified to export. User should clarify.
 */
const needsReviewRatioRule: Rule = ({ bom }) => {
  if (bom.length === 0) return [];
  const needs = bom.filter((item) => item.status === "needs_review").length;
  const ratio = needs / bom.length;
  if (ratio <= 0.5) return [];
  const pct = Math.round(ratio * 100);
  return [
    issue({
      rule: "DR-NEEDS-REVIEW-RATIO",
      severity: "warning",
      title: `${pct}% of BOM items still marked 'needs_review'`,
      detail:
        "Most BOM items are not yet committed. Consider answering the clarifying questions or providing preferred parts before exporting — the downstream KiCad project will inherit these unknowns."
    })
  ];
};

/**
 * DR-CONSTRAINT-CONFLICT: detect common contradiction between constraints
 * and BOM choices.
 */
const constraintConflictRule: Rule = ({ constraints, bom }) => {
  const out: DesignRuleIssue[] = [];
  const has2Layer = constraints.some((c) => /\b2[- ]?layer\b/i.test(c));
  const hasBga = bom.some((item) => /\bBGA\b/i.test(item.package));
  if (has2Layer && hasBga) {
    out.push(
      issue({
        rule: "DR-CONSTRAINT-CONFLICT",
        severity: "critical",
        title: "BGA package on 2-layer board",
        detail:
          "BGA packages generally require at least 4 layers to fan out the inner rows. A 2-layer constraint makes this BOM infeasible without switching to a QFN/LQFP alternative."
      })
    );
  }
  const hasLowCost = constraints.some((c) => /low[- ]?cost/i.test(c));
  const hasExpensivePkg = bom.some((item) => /\bBGA\b|\bCSP\b/i.test(item.package));
  if (hasLowCost && hasExpensivePkg) {
    out.push(
      issue({
        rule: "DR-CONSTRAINT-CONFLICT",
        severity: "warning",
        title: "Assembly-heavy package on low-cost design",
        detail:
          "BGA/CSP assembly adds X-ray inspection and rework cost. A low-cost constraint favours QFN/LQFP packages wherever the part offers the option."
      })
    );
  }
  return out;
};

// ─── Runner ─────────────────────────────────────────────────────────────

const ALL_RULES: Rule[] = [
  decouplingCapsRule,
  i2cPullupRule,
  esdProtectionRule,
  programmingHeaderRule,
  resetNetworkRule,
  orphanBlockRule,
  powerBlockRule,
  needsReviewRatioRule,
  constraintConflictRule
];

/**
 * Run every deterministic design rule and collect the issues.
 * Issues are returned in rule-registration order for stable output.
 */
export function runDesignRules(ctx: DesignRuleContext): DesignRuleIssue[] {
  const out: DesignRuleIssue[] = [];
  for (const rule of ALL_RULES) {
    try {
      out.push(...rule(ctx));
    } catch (err) {
      // A buggy rule must never break the pipeline. But silently
      // swallowing loses every diagnostic — log so regressions surface.
      console.error(
        `[design-rules] rule '${rule.name || "anonymous"}' threw, skipping:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return out;
}
