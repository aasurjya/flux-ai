import { promises as fs } from "node:fs";
import path from "node:path";
import archiver from "archiver";
import type { BomItem, CircuitBlock } from "@/types/project";
import { generateSymbolLibrary } from "./symbol-gen";
import { generateSchematic } from "./schematic-gen";
import { generateNetlistXml } from "./netlist-gen";
import { generateBomCsv } from "./bom-csv";
import { generateKicadProject } from "./project-file";

export interface BundleInput {
  projectName: string;
  bom: BomItem[];
  architectureBlocks: CircuitBlock[];
  outPath?: string; // when provided, also write zip to disk
}

export interface BundleEntry {
  name: string;
  content: string;
}

export interface BundleResult {
  buffer: Buffer;
  entries: BundleEntry[];
}

const LIB_NAME = "flux";

/**
 * Produce the full KiCad project bundle:
 *   - <name>.kicad_pro  (project metadata)
 *   - <name>.kicad_sch  (schematic)
 *   - <name>.kicad_sym  (project-local symbol library)
 *   - <name>-netlist.xml (KiCad netlist, export version E)
 *   - <name>-bom.csv    (BOM in standard KiCad column order)
 *
 * Returns the zipped buffer plus the raw entries so callers can inspect
 * individual contents without re-unzipping.
 */
export async function buildKicadExport(input: BundleInput): Promise<BundleResult> {
  if (input.bom.length === 0) {
    throw new Error("buildKicadExport: bom must be non-empty");
  }
  const { projectName, bom, architectureBlocks, outPath } = input;

  const entries: BundleEntry[] = [
    {
      name: `${projectName}.kicad_pro`,
      content: generateKicadProject({ projectName })
    },
    {
      name: `${projectName}.kicad_sch`,
      content: generateSchematic({ projectName, libName: LIB_NAME, bom, architectureBlocks })
    },
    {
      name: `${projectName}.kicad_sym`,
      content: generateSymbolLibrary(LIB_NAME, bom)
    },
    {
      name: `${projectName}-netlist.xml`,
      content: generateNetlistXml({ projectName, bom, architectureBlocks })
    },
    {
      name: `${projectName}-bom.csv`,
      content: generateBomCsv(bom)
    }
  ];

  const buffer = await zipEntries(entries);

  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, buffer);
  }

  return { buffer, entries };
}

function zipEntries(entries: BundleEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    archive.on("warning", (err) => {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") reject(err);
    });
    for (const entry of entries) {
      archive.append(entry.content, { name: entry.name });
    }
    void archive.finalize();
  });
}
