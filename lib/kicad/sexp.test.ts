import { describe, it, expect } from "vitest";
import { node, atom, str, serialize } from "./sexp";

describe("sexp builder + serializer", () => {
  it("serializes a flat list with atoms", () => {
    const s = node("version", atom(20231120));
    expect(serialize(s)).toBe("(version 20231120)");
  });

  it("serializes a nested list", () => {
    const s = node("title_block",
      node("title", str("My Demo Board")),
      node("rev", str("1.0.0"))
    );
    expect(serialize(s, { pretty: false })).toBe(
      '(title_block (title "My Demo Board") (rev "1.0.0"))'
    );
  });

  it("pretty-prints with 2-space indent", () => {
    const s = node("title_block",
      node("title", str("Demo")),
      node("rev", str("1.0"))
    );
    expect(serialize(s, { pretty: true })).toBe(
      `(title_block\n  (title "Demo")\n  (rev "1.0")\n)`
    );
  });

  it("escapes double quotes and backslashes in strings", () => {
    const s = node("note", str('He said "hi" \\ bye'));
    expect(serialize(s)).toBe('(note "He said \\"hi\\" \\\\ bye")');
  });

  it("formats integers without a decimal point and floats with one", () => {
    const s = node("xy", atom(10), atom(2.54));
    expect(serialize(s)).toBe("(xy 10 2.54)");
  });

  it("strips IEEE-754 precision noise from floating-point arithmetic", () => {
    // 25.4 + 5.08 = 30.479999999999997 in JS float math. We must not
    // emit that noise — KiCad accepts it but it looks broken.
    const sum = 25.4 + 5.08;
    const s = node("at", atom(sum), atom(0));
    expect(serialize(s)).toBe("(at 30.48 0)");
  });

  it("rounds to 4 decimal places (KiCad sub-micron precision)", () => {
    const s = node("x", atom(1.234567));
    expect(serialize(s)).toBe("(x 1.2346)");
  });

  it("handles an empty list (no children)", () => {
    const s = node("lib_symbols");
    expect(serialize(s)).toBe("(lib_symbols)");
  });

  it("matches a KiCad-like minimal schematic header", () => {
    const s = node("kicad_sch",
      node("version", atom(20231120)),
      node("generator", atom("flux_ai")),
      node("uuid", str("00000000-0000-0000-0000-000000000001")),
      node("title_block", node("title", str("Demo"))),
      node("lib_symbols")
    );
    const out = serialize(s, { pretty: true });
    expect(out).toContain("(kicad_sch");
    expect(out).toContain("(version 20231120)");
    expect(out).toContain("(generator flux_ai)");
    expect(out).toContain('(title "Demo")');
    expect(out).toContain("(lib_symbols)");
  });
});
