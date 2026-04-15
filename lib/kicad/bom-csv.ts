import type { BomItem } from "@/types/project";

/**
 * Generate a KiCad-compatible BOM CSV from a BomItem[].
 *
 * Columns match the standard KiCad BOM plugin output so downstream tools
 * (JLCPCB, Mouser imports, ibom) recognise them.
 */

const HEADER = ["Reference", "Value", "Footprint", "Quantity", "Status"] as const;

function needsQuoting(field: string): boolean {
  return /[",\r\n]/.test(field);
}

function csvEscape(field: string): string {
  if (!needsQuoting(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

function formatLine(cells: string[]): string {
  return cells.map(csvEscape).join(",");
}

export function generateBomCsv(bom: BomItem[]): string {
  if (bom.length === 0) {
    throw new Error("generateBomCsv: bom must be non-empty");
  }
  const lines: string[] = [formatLine([...HEADER])];
  for (const item of bom) {
    lines.push(
      formatLine([
        item.designator,
        item.name,
        item.package,
        String(item.quantity),
        item.status
      ])
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Minimal RFC-4180-ish CSV parser — good enough for round-tripping our
 * own output + typical KiCad BOM exports. Not a general-purpose CSV lib.
 */
export function parseBomCsv(csv: string): Array<Record<string, string>> {
  const rows = parseRows(csv);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows.map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => {
      obj[key] = row[i] ?? "";
    });
    return obj;
  });
}

function parseRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  while (i < csv.length) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && csv[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}
