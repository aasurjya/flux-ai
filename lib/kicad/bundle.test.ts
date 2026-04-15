import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildKicadExport } from "./bundle";
import type { BomItem, CircuitBlock } from "@/types/project";

const bom: BomItem[] = [
  { id: "u1", designator: "U1", name: "ESP32-S3", quantity: 1, package: "Module", status: "selected" },
  { id: "u2", designator: "U2", name: "LDO", quantity: 1, package: "SOT-223", status: "selected" }
];
const blocks: CircuitBlock[] = [
  { id: "mcu", label: "MCU", kind: "processing", connections: ["3v3"] },
  { id: "3v3", label: "3.3V", kind: "power", connections: ["mcu"] }
];

describe("buildKicadExport", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flux-bundle-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("produces a buffer containing the zip entries", async () => {
    const { buffer, entries } = await buildKicadExport({
      projectName: "Demo Board",
      bom,
      architectureBlocks: blocks
    });
    expect(buffer.length).toBeGreaterThan(500);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual([
      "Demo Board-bom.csv",
      "Demo Board-netlist.xml",
      "Demo Board.kicad_pro",
      "Demo Board.kicad_sch",
      "Demo Board.kicad_sym"
    ]);
  });

  it("writes the bundle to disk when outPath is provided", async () => {
    const outPath = path.join(tmpDir, "out.zip");
    const result = await buildKicadExport({
      projectName: "Demo",
      bom,
      architectureBlocks: blocks,
      outPath
    });
    const stat = await fs.stat(outPath);
    expect(stat.size).toBe(result.buffer.length);
  });

  it("bundle entries contain valid content (non-empty, correct prefix)", async () => {
    const { entries } = await buildKicadExport({
      projectName: "X",
      bom,
      architectureBlocks: blocks
    });
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.content]));
    expect(byName["X.kicad_sch"].startsWith("(kicad_sch")).toBe(true);
    expect(byName["X.kicad_sym"].startsWith("(kicad_symbol_lib")).toBe(true);
    expect(byName["X-netlist.xml"].startsWith('<?xml version="1.0"')).toBe(true);
    expect(byName["X-bom.csv"].split("\n")[0]).toBe("Reference,Value,Footprint,Quantity,Status");
    expect(byName["X.kicad_pro"]).toContain('"meta"');
  });

  it("throws on empty BOM (nothing useful to export)", async () => {
    await expect(
      buildKicadExport({ projectName: "x", bom: [], architectureBlocks: blocks })
    ).rejects.toThrow(/bom/i);
  });
});
