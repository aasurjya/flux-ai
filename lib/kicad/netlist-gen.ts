import type { BomItem, CircuitBlock, CircuitBlockKind } from "@/types/project";

/**
 * Minimal KiCad-style netlist XML (export version "E").
 *
 * Nets emitted here are a STARTING POINT. We don't have pin-level info
 * so we name nets semantically (VBUS_IN, VCC_3V3, SIG_MCU_SENSOR) based
 * on the kinds of blocks being connected. Pin numbers default to the
 * most common power/signal pin per component kind, not guaranteed to
 * match real parts. The user refines in Eeschema after import.
 *
 * This honest-but-useful approach beats both:
 *   - emitting nothing (loses the logical connection info)
 *   - emitting garbage with pin="1" everywhere and net names like
 *     "/usb-in_pwr-prot" (looks precise but isn't)
 */

export interface GenerateNetlistInput {
  projectName: string;
  bom: BomItem[];
  architectureBlocks: CircuitBlock[];
}

function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function today(): string {
  return new Date().toISOString();
}

interface EdgeKey { a: string; b: string; key: string; }

function uniqueEdges(blocks: CircuitBlock[]): EdgeKey[] {
  const seen = new Set<string>();
  const out: EdgeKey[] = [];
  for (const block of blocks) {
    for (const target of block.connections) {
      const [a, b] = [block.id, target].sort();
      const key = `${a}__${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a, b, key });
    }
  }
  return out;
}

/**
 * Map each architecture-block to a representative BOM reference.
 * Distinct blocks get distinct refs whenever possible: we walk the BOM
 * in order, matching each block to the next unused item. Falls back to
 * cyclic indexing if there are more blocks than BOM items.
 */
function buildBlockRefMap(
  blocks: CircuitBlock[],
  bom: BomItem[]
): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    let ref: string | undefined;
    for (const item of bom) {
      if (used.has(item.designator)) continue;
      ref = item.designator;
      used.add(item.designator);
      break;
    }
    if (!ref) {
      // Exhausted unique refs — cycle back through the BOM
      ref = bom[i % bom.length].designator;
    }
    map.set(b.id, ref);
  }
  return map;
}

/**
 * Semantic net name from the two connected blocks' kinds. Matches KiCad
 * conventions where possible (VBUS_IN, VCC_3V3, GND, I2C_SDA, USB_DP).
 * Falls back to SIG_<fromKind>_<toKind> for anything else.
 *
 * Why this matters: a netlist with `<net name="/pwr-prot_usb-in">` is
 * noise to a hardware engineer. A netlist with `<net name="VBUS_IN">`
 * is actionable — they know which rail it is.
 */
function netNameFor(from: CircuitBlock, to: CircuitBlock): string {
  const kinds = new Set<CircuitBlockKind>([from.kind, to.kind]);
  const has = (k: CircuitBlockKind) => kinds.has(k);

  // Power rail edges
  if (has("power") && (has("protection") || has("interface"))) {
    // Upstream of regulator = VBUS
    const label = from.label + to.label;
    if (/usb[- ]?c/i.test(label)) return "VBUS_USB";
    return "VBUS_IN";
  }
  if (has("power") && has("processing")) {
    const label = from.label + to.label;
    if (/3[.v]?3|3v3/i.test(label)) return "VCC_3V3";
    if (/5v|5\.0v/i.test(label)) return "VCC_5V";
    if (/1[.v]?8/i.test(label)) return "VCC_1V8";
    return "VCC";
  }
  if (has("power") && has("sensor")) return "VCC_SENSOR";
  if (has("power") && has("analog")) return "VCC_ANA";

  // Bus edges
  const otherLabel = from.label + to.label;
  if (/\bi2c\b|i²c/i.test(otherLabel)) return "I2C_BUS";
  if (/\bspi\b/i.test(otherLabel)) return "SPI_BUS";
  if (/\buart\b|\btx|\brx/i.test(otherLabel)) return "UART";
  if (/\bcan\b/i.test(otherLabel)) return "CAN";
  if (/\busb[- ]?[dp]|\bdp\b|\bdm\b/i.test(otherLabel)) return "USB_DP_DM";
  if (/\bswd\b|\bdebug/i.test(otherLabel)) return "SWD";

  // Signal edge between specific block kinds
  const parts = [from.kind, to.kind].sort().join("_");
  return `SIG_${parts.toUpperCase()}`;
}

/**
 * Reasonable default pin numbers for connection endpoints when we don't
 * have real pin-level info. Pin 1 for "enter" side of power/connector,
 * pin 2 for "exit" side of a signal. This is still approximate but much
 * less misleading than pin="1" on both ends of every net.
 */
function defaultPin(block: CircuitBlock, otherKind: CircuitBlockKind): string {
  // Power-side always pin 1
  if (block.kind === "power") return "1";
  // Connector pins to power rails → pin 1
  if (block.kind === "interface" && otherKind === "power") return "1";
  // Processing to anything → pin 2 (signal side)
  if (block.kind === "processing") return "2";
  return "1";
}

export function generateNetlistXml(input: GenerateNetlistInput): string {
  if (input.bom.length === 0) {
    throw new Error("generateNetlistXml: bom must be non-empty");
  }

  const { projectName, bom, architectureBlocks } = input;

  const components = bom
    .map(
      (item) => `    <comp ref="${esc(item.designator)}">
      <value>${esc(item.name)}</value>
      <footprint>${esc(item.package)}</footprint>
      <fields>
        <field name="Status">${esc(item.status)}</field>
      </fields>
    </comp>`
    )
    .join("\n");

  const libparts = bom
    .map(
      (item) => `    <libpart lib="flux" part="${esc(item.designator)}">
      <description>${esc(item.name)}</description>
      <footprints><fp>${esc(item.package)}</fp></footprints>
      <fields>
        <field name="Reference">${esc(item.designator)}</field>
        <field name="Value">${esc(item.name)}</field>
      </fields>
    </libpart>`
    )
    .join("\n");

  const refByBlock = buildBlockRefMap(architectureBlocks, bom);
  const blockById = new Map(architectureBlocks.map((b) => [b.id, b]));
  const edges = uniqueEdges(architectureBlocks);

  // Dedupe net names — multiple edges might produce the same semantic
  // net (e.g. two power→consumer edges both → VCC_3V3). We merge them
  // by name so KiCad sees one <net> with all connected nodes.
  const netsByName = new Map<string, Set<string>>();
  for (const edge of edges) {
    const blockA = blockById.get(edge.a);
    const blockB = blockById.get(edge.b);
    if (!blockA || !blockB) continue;
    const refA = refByBlock.get(edge.a);
    const refB = refByBlock.get(edge.b);
    if (!refA || !refB || refA === refB) continue;
    const name = netNameFor(blockA, blockB);
    const pinA = defaultPin(blockA, blockB.kind);
    const pinB = defaultPin(blockB, blockA.kind);
    const nodes = netsByName.get(name) ?? new Set<string>();
    nodes.add(`${refA}::${pinA}`);
    nodes.add(`${refB}::${pinB}`);
    netsByName.set(name, nodes);
  }

  const nets = Array.from(netsByName.entries())
    .map(([name, nodeSet], i) => {
      const nodeXml = Array.from(nodeSet)
        .map((spec) => {
          const [ref, pin] = spec.split("::");
          return `      <node ref="${esc(ref)}" pin="${esc(pin)}"/>`;
        })
        .join("\n");
      return `    <net code="${i + 1}" name="/${esc(name)}">
${nodeXml}
    </net>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<export version="E">
  <design>
    <source>${esc(projectName)}.kicad_sch</source>
    <date>${esc(today())}</date>
    <tool>flux.ai</tool>
  </design>
  <components>
${components}
  </components>
  <libparts>
${libparts}
  </libparts>
  <nets>
${nets}
  </nets>
</export>
`;
}
