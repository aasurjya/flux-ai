import type { BomItem, CircuitBlock } from "@/types/project";

/**
 * Minimal KiCad-style netlist XML (export version "E").
 *
 * What this produces:
 *   - <design> section (source, date, tool)
 *   - <components> — one <comp> per BOM item
 *   - <libparts> — one <libpart> per BOM item (no pin details)
 *   - <nets> — one <net> per unique architecture-block connection pair,
 *              wiring each participating block's primary BOM ref.
 *
 * The nets are intentionally approximate: architecture blocks are a
 * logical view, not a pin-level one, so we map each connection to a
 * single synthetic net (NET_<id>_<id>) with the two blocks' BOM refs.
 * KiCad imports this as a starting point; the user refines in Eeschema.
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
  const edges = uniqueEdges(architectureBlocks);
  const nets = edges
    .map((edge, i) => {
      const refA = refByBlock.get(edge.a);
      const refB = refByBlock.get(edge.b);
      if (!refA || !refB || refA === refB) return "";
      return `    <net code="${i + 1}" name="/${esc(edge.a)}_${esc(edge.b)}">
      <node ref="${esc(refA)}" pin="1"/>
      <node ref="${esc(refB)}" pin="1"/>
    </net>`;
    })
    .filter(Boolean)
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
