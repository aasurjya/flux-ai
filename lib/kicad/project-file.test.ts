import { describe, it, expect } from "vitest";
import { generateKicadProject } from "./project-file";

describe("generateKicadProject", () => {
  it("returns valid JSON", () => {
    const output = generateKicadProject({ projectName: "TestBoard" });
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("includes the project name in meta.filename", () => {
    const output = generateKicadProject({ projectName: "MyDesign" });
    const parsed = JSON.parse(output);
    expect(parsed.meta.filename).toBe("MyDesign.kicad_pro");
  });

  it("includes a Default net class with standard values", () => {
    const parsed = JSON.parse(generateKicadProject({ projectName: "X" }));
    const defaultClass = parsed.net_settings.classes[0];
    expect(defaultClass.name).toBe("Default");
    expect(defaultClass.track_width).toBe(0.25);
    expect(defaultClass.clearance).toBe(0.2);
  });

  it("includes a root sheet UUID", () => {
    const parsed = JSON.parse(generateKicadProject({ projectName: "X" }));
    expect(parsed.sheets).toHaveLength(1);
    expect(parsed.sheets[0][1]).toBe("Root");
  });

  it("ends with a newline (POSIX convention)", () => {
    const output = generateKicadProject({ projectName: "X" });
    expect(output.endsWith("\n")).toBe(true);
  });

  it("handles project names with spaces and special chars", () => {
    const output = generateKicadProject({ projectName: "My Board v2.1" });
    const parsed = JSON.parse(output);
    expect(parsed.meta.filename).toBe("My Board v2.1.kicad_pro");
  });
});
