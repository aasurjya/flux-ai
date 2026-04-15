import type { AiClient, CallStructuredOptions, CallTextOptions } from "./client";
import { AiClientError } from "./client";
import type { BomItem, CircuitBlock, ValidationIssue } from "@/types/project";

/**
 * Deterministic stub AI client for USE_REAL_AI=false.
 *
 * Returns plausible canned responses keyed by schema name so the full
 * generation pipeline works offline without an ANTHROPIC_API_KEY. The
 * outputs are intentionally generic — the real value comes from setting
 * USE_REAL_AI=true in production.
 */
export function createStubAiClient(): AiClient {
  return {
    async callText(_opts: CallTextOptions): Promise<string> {
      return "Stub response — enable USE_REAL_AI for live LLM output.";
    },

    async callStructured<T>(opts: CallStructuredOptions<T>): Promise<T> {
      const canned = STUB_RESPONSES[opts.schemaName];
      if (!canned) {
        throw new AiClientError(`Stub client has no canned response for ${opts.schemaName}`);
      }
      const parsed = opts.schema.safeParse(canned);
      if (!parsed.success) {
        throw new AiClientError(
          `Stub for ${opts.schemaName} does not satisfy its own schema: ${parsed.error.message}`,
          parsed.error
        );
      }
      return parsed.data;
    }
  };
}

const STUB_BLOCKS: CircuitBlock[] = [
  { id: "usb-in", label: "USB-C Input", kind: "interface", connections: ["pwr-prot"] },
  { id: "pwr-prot", label: "Input Protection", kind: "protection", connections: ["usb-in", "3v3"] },
  { id: "3v3", label: "3.3V Regulator", kind: "power", connections: ["pwr-prot", "mcu"] },
  { id: "mcu", label: "MCU", kind: "processing", connections: ["3v3", "debug"] },
  { id: "debug", label: "SWD / UART header", kind: "interface", connections: ["mcu"] }
];

const STUB_BOM: BomItem[] = [
  { id: "bom-j1", designator: "J1", name: "USB-C receptacle, 16-pin", quantity: 1, package: "SMD", status: "selected" },
  { id: "bom-d1", designator: "D1", name: "ESD TVS array", quantity: 1, package: "SOT-23-6", status: "selected" },
  { id: "bom-u1", designator: "U1", name: "3.3V LDO 500 mA", quantity: 1, package: "SOT-223", status: "needs_review" },
  { id: "bom-u2", designator: "U2", name: "ESP32-S3-WROOM-1 (example — confirm part in the real AI run)", quantity: 1, package: "Module", status: "needs_review" },
  { id: "bom-j2", designator: "J2", name: "SWD / UART 2x5 header", quantity: 1, package: "THT 1.27 mm", status: "selected" }
];

const STUB_ISSUES: ValidationIssue[] = [
  {
    id: "val-1",
    severity: "warning",
    title: "Confirm regulator thermal headroom",
    detail:
      "Verify LDO junction temperature under peak MCU current; consider a buck regulator if worst-case dissipation exceeds package capability."
  },
  {
    id: "val-2",
    severity: "info",
    title: "Add test pads before export",
    detail: "Add test pads for 3V3, GND, SWCLK, SWDIO, TX, and RX to aid bring-up."
  }
];

const STUB_RESPONSES: Record<string, unknown> = {
  emit_requirements: {
    requirements: [
      "Accept USB-C 5V input with over-voltage and ESD protection.",
      "Provide a regulated 3.3V rail to the MCU and supporting peripherals.",
      "Expose a programming/debug header (SWD or UART) for bring-up.",
      "Respect the stated form factor and layer-count constraints."
    ]
  },
  emit_clarifying_questions: {
    questions: []
  },
  emit_architecture: {
    blocks: STUB_BLOCKS
  },
  emit_bom: {
    items: STUB_BOM
  },
  emit_validations: {
    issues: STUB_ISSUES
  },
  propose_design_improvements: {
    summary: "Resolved decoupling and pull-up findings from design-rule validator.",
    bomAdditions: [
      {
        designator: "C1",
        name: "100nF X7R ceramic decoupling",
        package: "0402",
        quantity: 4,
        status: "selected",
        rationale: "Resolves DR-DECOUPLING: one 100nF per active IC VDD pin within 3mm"
      },
      {
        designator: "C2",
        name: "10uF X5R bulk capacitor",
        package: "0603",
        quantity: 2,
        status: "selected",
        rationale: "Resolves DR-DECOUPLING: bulk energy reservoir per regulator output"
      }
    ],
    bomRemovals: []
  }
};
