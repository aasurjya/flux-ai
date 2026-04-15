import type { BomItem } from "@/types/project";
import { atom, node, str, serialize } from "./sexp";

/**
 * Generate a minimal but valid KiCad symbol library (.kicad_sym) for a
 * given BOM. Each BOM item becomes a placeholder symbol with:
 *   - Reference, Value, Footprint, Datasheet properties
 *   - A small rectangle body so the symbol renders when placed
 *   - No pins (the user edits the symbol in KiCad after opening)
 *
 * This is intentionally pragmatic: AI-generated BOM rarely has enough
 * info to draw real pinout. The user verifies and refines inside KiCad.
 */

const VERSION = 20231120;
const GENERATOR = "flux_ai";

// Simple deterministic uuid-like string from a seed. KiCad accepts any
// valid UUID-shaped identifier; it doesn't have to be a real RFC4122 UUID
// for the file to load.
function pseudoUuid(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hex = (Math.abs(h).toString(16) + "00000000").slice(0, 8);
  return `${hex}-0000-4000-8000-000000000001`;
}

function propertyNode(name: string, value: string, y: number): ReturnType<typeof node> {
  return node(
    "property",
    str(name),
    str(value),
    node("at", atom(0), atom(y), atom(0)),
    node(
      "effects",
      node("font", node("size", atom(1.27), atom(1.27)))
    )
  );
}

function symbolNode(libName: string, item: BomItem): ReturnType<typeof node> {
  const symId = `${libName}:${item.designator}`;
  return node(
    "symbol",
    str(symId),
    node("exclude_from_sim", atom("no")),
    node("in_bom", atom("yes")),
    node("on_board", atom("yes")),
    propertyNode("Reference", item.designator, 2.54),
    propertyNode("Value", item.name, -2.54),
    propertyNode("Footprint", item.package, -5.08),
    propertyNode("Datasheet", "~", -7.62),
    node(
      "symbol",
      str(`${item.designator}_0_1`),
      node(
        "rectangle",
        node("start", atom(-5.08), atom(2.54)),
        node("end", atom(5.08), atom(-2.54)),
        node(
          "stroke",
          node("width", atom(0.254)),
          node("type", atom("default"))
        ),
        node("fill", node("type", atom("background")))
      )
    )
  );
}

export function generateSymbolLibrary(libName: string, bom: BomItem[]): string {
  if (bom.length === 0) {
    throw new Error("generateSymbolLibrary: bom must be non-empty");
  }

  const lib = node(
    "kicad_symbol_lib",
    node("version", atom(VERSION)),
    node("generator", atom(GENERATOR)),
    ...bom.map((item) => symbolNode(libName, item))
  );

  // KiCad expects a uuid on the top-level wrapper — not strictly required
  // for .kicad_sym but we add a comment line for traceability via a
  // harmless `(generator_version "..." ...)` line in a future revision.
  void pseudoUuid(libName); // reserved for future extension

  return serialize(lib, { pretty: true }) + "\n";
}
