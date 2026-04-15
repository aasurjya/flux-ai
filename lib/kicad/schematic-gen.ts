import type { BomItem, CircuitBlock } from "@/types/project";
import { atom, node, str, serialize, SExp } from "./sexp";
import { mapToStdSymbol } from "./symbol-map";
import { netNameFor, uniqueEdges, buildBlockRefMap } from "./netlist-gen";

/**
 * KiCad stdlib power symbol for a given semantic rail name. Matches
 * symbols shipping in KiCad 8's `power:` library. Returns null for
 * rails we can't map confidently — the generic placed lib_symbol still
 * renders so nothing is lost.
 */
function powerLibIdFor(netName: string): string | null {
  if (netName === "VCC_3V3") return "power:+3V3";
  if (netName === "VCC_5V") return "power:+5V";
  if (netName === "VCC_1V8") return "power:+1V8";
  if (netName === "VCC") return "power:VCC";
  if (netName === "VBUS_USB" || netName === "VBUS_IN") return "power:VBUS";
  if (netName === "VCC_SENSOR" || netName === "VCC_ANA") return "power:+3V3"; // conservative
  return null;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * KiCad global label at a given position. Labels with matching text
 * connect by name — KiCad's ERC treats them as one net. This is how
 * we "wire" without pin-level geometry.
 */
function globalLabelNode(name: string, x: number, y: number): SExp {
  const uuidSuffix = Math.abs(hashSeed(`label-${name}-${x}-${y}`))
    .toString()
    .padStart(12, "0")
    .slice(0, 12);
  return node(
    "global_label",
    str(name),
    node("shape", atom("input")),
    node("at", atom(x), atom(y), atom(0)),
    node(
      "effects",
      node("font", node("size", atom(1.27), atom(1.27))),
      node("justify", atom("left"))
    ),
    node("uuid", str(`00000000-0000-4000-b000-${uuidSuffix}`))
  );
}

/** KiCad stdlib power symbol placement (`power:+3V3` etc). */
function powerSymbolNode(projectName: string, libId: string, x: number, y: number): SExp {
  const uuidSuffix = Math.abs(hashSeed(`power-${libId}-${x}-${y}`))
    .toString()
    .padStart(12, "0")
    .slice(0, 12);
  return node(
    "symbol",
    node("lib_id", str(libId)),
    node("at", atom(x), atom(y), atom(0)),
    node("unit", atom(1)),
    node("exclude_from_sim", atom("no")),
    node("in_bom", atom("no")),
    node("on_board", atom("yes")),
    node("dnp", atom("no")),
    node("uuid", str(`00000000-0000-4000-c000-${uuidSuffix}`)),
    node(
      "instances",
      node(
        "project",
        str(projectName),
        node(
          "path",
          str(`/${SHEET_UUID}`),
          node("reference", str("#PWR")),
          node("unit", atom(1))
        )
      )
    )
  );
}

const VERSION = 20231120;
const GENERATOR = "flux_ai";
const SHEET_UUID = "00000000-0000-4000-a000-000000000001";

/**
 * Produce a valid minimal KiCad schematic (.kicad_sch) for a BOM + architecture.
 *
 * What this DOES emit:
 *   - Proper header (version, generator, uuid, paper, title_block)
 *   - lib_symbols containing each BOM item as a placeholder symbol
 *   - Placed symbol instances laid out on a grid so KiCad shows them
 *   - sheet_instances / project-scoped instances so KiCad opens cleanly
 *
 * What this does NOT emit (intentionally out of scope for MVP):
 *   - Real pin counts / pin assignments (AI rarely has that info)
 *   - Wires, labels, junctions (requires pin-level knowledge)
 *   - Hierarchical sheets
 *
 * The result is a working starter schematic the user refines inside KiCad.
 */

export interface GenerateSchematicInput {
  projectName: string;
  libName: string; // library identifier prefix, e.g. "flux"
  bom: BomItem[];
  architectureBlocks: CircuitBlock[];
}

function pseudoUuid(seed: string, salt: number): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  h = (h + salt * 2654435761) | 0;
  const hex = (Math.abs(h).toString(16) + "00000000").slice(0, 8);
  return `${hex}-0000-4000-8000-${(Math.abs(h >>> 0) + 1e12)
    .toString()
    .slice(0, 12)
    .padStart(12, "0")}`;
}

function propertyNode(name: string, value: string, x: number, y: number): SExp {
  return node(
    "property",
    str(name),
    str(value),
    node("at", atom(x), atom(y), atom(0)),
    node("effects", node("font", node("size", atom(1.27), atom(1.27))))
  );
}

function libSymbolNode(libName: string, item: BomItem): SExp {
  const libId = `${libName}:${item.designator}`;
  return node(
    "symbol",
    str(libId),
    node("exclude_from_sim", atom("no")),
    node("in_bom", atom("yes")),
    node("on_board", atom("yes")),
    propertyNode("Reference", item.designator, 0, 2.54),
    propertyNode("Value", item.name, 0, -2.54),
    propertyNode("Footprint", item.package, 0, -5.08),
    propertyNode("Datasheet", "~", 0, -7.62),
    node(
      "symbol",
      str(`${item.designator}_0_1`),
      node(
        "rectangle",
        node("start", atom(-5.08), atom(2.54)),
        node("end", atom(5.08), atom(-2.54)),
        node("stroke", node("width", atom(0.254)), node("type", atom("default"))),
        node("fill", node("type", atom("background")))
      )
    )
  );
}

function placedSymbolNode(
  projectName: string,
  libName: string,
  item: BomItem,
  x: number,
  y: number,
  seed: string
): SExp {
  // Prefer a KiCad standard-library symbol (Device:R, Connector:USB_C_...)
  // when one exists — the user gets a real, pinned symbol. Fall back to
  // the project-local placeholder for ICs / custom parts.
  const libId = mapToStdSymbol(item) ?? `${libName}:${item.designator}`;
  return node(
    "symbol",
    node("lib_id", str(libId)),
    node("at", atom(x), atom(y), atom(0)),
    node("unit", atom(1)),
    node("exclude_from_sim", atom("no")),
    node("in_bom", atom("yes")),
    node("on_board", atom("yes")),
    node("dnp", atom("no")),
    node("uuid", str(pseudoUuid(seed, 1))),
    propertyNode("Reference", item.designator, x, y - 5.08),
    propertyNode("Value", item.name, x, y + 5.08),
    propertyNode("Footprint", item.package, x, y + 7.62),
    propertyNode("Datasheet", "~", x, y + 10.16),
    node(
      "instances",
      node(
        "project",
        str(projectName),
        node(
          "path",
          str(`/${SHEET_UUID}`),
          node("reference", str(item.designator)),
          node("unit", atom(1))
        )
      )
    )
  );
}

export function generateSchematic(input: GenerateSchematicInput): string {
  if (input.bom.length === 0) {
    throw new Error("generateSchematic: bom must be non-empty");
  }

  const { projectName, libName, bom, architectureBlocks } = input;
  const today = new Date().toISOString().slice(0, 10);

  const customBom = bom.filter((item) => mapToStdSymbol(item) === null);
  const libSymbols = node(
    "lib_symbols",
    ...customBom.map((item) => libSymbolNode(libName, item))
  );

  const COLS = 4;
  const SPACING = 25.4;
  const ORIGIN_X = 25.4;
  const ORIGIN_Y = 25.4;

  // Track positions so net labels + power symbols can anchor near the
  // corresponding placed BOM symbol.
  const designatorPositions = new Map<string, { x: number; y: number }>();
  const placed = bom.map((item, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = ORIGIN_X + col * SPACING;
    const y = ORIGIN_Y + row * SPACING;
    designatorPositions.set(item.designator, { x, y });
    return placedSymbolNode(
      projectName,
      libName,
      item,
      x,
      y,
      `${projectName}:${item.designator}`
    );
  });

  // Net labels — for each unique architecture edge, emit a global_label
  // at each endpoint's placed position. KiCad's ERC wires same-named
  // labels into one net, so we don't need pin-level wire geometry.
  // Reuses netNameFor + uniqueEdges + buildBlockRefMap from netlist-gen
  // so the schematic and netlist XML use identical semantic names.
  const blockById = new Map(architectureBlocks.map((b) => [b.id, b]));
  const refByBlock =
    architectureBlocks.length > 0
      ? buildBlockRefMap(architectureBlocks, bom)
      : new Map<string, string>();
  const netLabels: SExp[] = [];
  for (const edge of uniqueEdges(architectureBlocks)) {
    const blockA = blockById.get(edge.a);
    const blockB = blockById.get(edge.b);
    if (!blockA || !blockB) continue;
    const refA = refByBlock.get(edge.a);
    const refB = refByBlock.get(edge.b);
    if (!refA || !refB || refA === refB) continue;
    const posA = designatorPositions.get(refA);
    const posB = designatorPositions.get(refB);
    if (!posA || !posB) continue;
    const name = netNameFor(blockA, blockB);
    // Offset labels above each symbol so they don't overlap the shape
    netLabels.push(globalLabelNode(name, posA.x, posA.y - 8));
    netLabels.push(globalLabelNode(name, posB.x, posB.y - 8));
  }

  // Power symbols — for every power-kind block whose connections we can
  // name as a recognised rail, place a KiCad stdlib power symbol near
  // its placed item. Gives the user the proper KiCad +3V3 / VBUS / GND
  // visual instead of a generic rectangle.
  const powerSymbols: SExp[] = [];
  for (const block of architectureBlocks) {
    if (block.kind !== "power") continue;
    let railName: string | null = null;
    for (const targetId of block.connections) {
      const target = blockById.get(targetId);
      if (!target) continue;
      const candidate = netNameFor(block, target);
      railName = candidate;
      if (candidate.startsWith("VCC") || candidate.startsWith("VBUS")) break;
    }
    if (!railName) continue;
    const libId = powerLibIdFor(railName);
    if (!libId) continue;
    const ref = refByBlock.get(block.id);
    if (!ref) continue;
    const pos = designatorPositions.get(ref);
    if (!pos) continue;
    powerSymbols.push(powerSymbolNode(projectName, libId, pos.x, pos.y - 15));
  }

  const sheetInstances = node(
    "sheet_instances",
    node("path", str("/"), node("page", str("1")))
  );

  const sch = node(
    "kicad_sch",
    node("version", atom(VERSION)),
    node("generator", atom(GENERATOR)),
    node("uuid", str(SHEET_UUID)),
    node("paper", str("A4")),
    node(
      "title_block",
      node("title", str(projectName)),
      node("date", str(today)),
      node("rev", str("1.0")),
      node("company", str("flux.ai"))
    ),
    libSymbols,
    ...placed,
    ...powerSymbols,
    ...netLabels,
    sheetInstances
  );

  return serialize(sch, { pretty: true }) + "\n";
}
