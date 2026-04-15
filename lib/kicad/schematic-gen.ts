import type { BomItem, CircuitBlock } from "@/types/project";
import { atom, node, str, serialize, SExp } from "./sexp";

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
  const libId = `${libName}:${item.designator}`;
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

  const { projectName, libName, bom } = input;
  const today = new Date().toISOString().slice(0, 10);

  const libSymbols = node("lib_symbols", ...bom.map((item) => libSymbolNode(libName, item)));

  // Simple grid: 4 columns, 25.4mm spacing, starting at (25.4, 25.4)
  const COLS = 4;
  const SPACING = 25.4;
  const ORIGIN_X = 25.4;
  const ORIGIN_Y = 25.4;
  const placed = bom.map((item, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return placedSymbolNode(
      projectName,
      libName,
      item,
      ORIGIN_X + col * SPACING,
      ORIGIN_Y + row * SPACING,
      `${projectName}:${item.designator}`
    );
  });

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
    sheetInstances
  );

  return serialize(sch, { pretty: true }) + "\n";
}
