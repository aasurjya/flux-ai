import type { BomItem } from "@/types/project";

/**
 * Map a BomItem to a KiCad built-in standard-library symbol reference
 * (e.g. "Device:R", "Connector:USB_C_Receptacle_USB2.0") when one
 * exists. Returns null for ICs and custom parts where we emit a
 * placeholder symbol into the project's local .kicad_sym instead.
 *
 * The reason to prefer standard library symbols: KiCad ships them with
 * proper pin definitions, drawing, and simulation-ready properties.
 * Our placeholder rectangles have none of that. Referencing the stdlib
 * makes the generated schematic open with real, usable symbols that
 * the engineer can wire immediately.
 *
 * Source of symbol names: KiCad 8 standard symbol libraries
 * (/usr/share/kicad/symbols/*.kicad_sym on Linux; ships with the app).
 */

/** Extract the alphabetic prefix from a designator like "R1", "R1-R2" → "R". */
function prefixOf(designator: string): string {
  const match = designator.match(/^([A-Z]+)/);
  return match ? match[1] : "";
}

export function mapToStdSymbol(item: BomItem): string | null {
  const prefix = prefixOf(item.designator);
  const name = item.name.toLowerCase();

  // Passive parts — always map to Device:* stdlib
  switch (prefix) {
    case "R": return "Device:R";
    case "C": return "Device:C";
    case "L": return "Device:L";
    case "Y": return "Device:Crystal";
  }

  // Diodes: discriminate LED vs generic diode by name
  if (prefix === "D") {
    if (/\bled\b/.test(name)) return "Device:LED";
    return "Device:D";
  }

  // Transistors: default to a generic NPN BJT. If the part name mentions
  // MOSFET/PMOS/NMOS we'll return the appropriate stdlib symbol.
  if (prefix === "Q") {
    if (/\bp-?mos|pmos/.test(name)) return "Device:Q_PMOS_GSD";
    if (/\bn-?mos|nmos|mosfet\b/.test(name)) return "Device:Q_NMOS_GSD";
    return "Device:Q_NPN_BCE";
  }

  // Connectors (J prefix): discriminate by name
  if (prefix === "J") {
    if (/\busb[- ]?c\b|\btype[- ]?c\b/.test(name)) {
      return "Connector:USB_C_Receptacle_USB2.0";
    }
    if (/\busb[- ]?a\b/.test(name)) {
      return "Connector:USB_A";
    }
    if (/\brj45\b|\bethernet\b/.test(name)) {
      return "Connector:RJ45";
    }
    if (/\bhdmi\b/.test(name)) {
      return "Connector:HDMI_A_Receptacle";
    }
    // Generic N-pin header — extract pin count from name, fall back to 1x04
    const pinMatch = name.match(/(\d+)[- ]?pin|\b1x(\d+)|\b2x(\d+)/);
    if (pinMatch) {
      const n = Number(pinMatch[1] ?? pinMatch[2] ?? pinMatch[3]);
      if (!Number.isNaN(n) && n >= 2 && n <= 40) {
        return `Connector_Generic:Conn_01x${String(n).padStart(2, "0")}`;
      }
    }
    if (/\bswd\b|\bdebug\b|\bheader\b/.test(name)) {
      return "Connector_Generic:Conn_01x04";
    }
    // Unknown connector — return null so we emit a local placeholder
    return null;
  }

  // U, IC, and other active parts → no stdlib mapping; emit placeholder
  return null;
}

/**
 * True when the BOM item has a standard-library mapping. Used by
 * bundle code to decide whether to include a placeholder symbol in
 * the local .kicad_sym library or rely on KiCad's shipped libs.
 */
export function hasStdSymbol(item: BomItem): boolean {
  return mapToStdSymbol(item) !== null;
}
