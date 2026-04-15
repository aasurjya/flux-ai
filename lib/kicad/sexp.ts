/**
 * Minimal S-expression AST + serializer for the KiCad file format.
 *
 * KiCad v6+ uses S-expressions for .kicad_sch, .kicad_sym, .kicad_pcb,
 * .kicad_pro etc. This module produces only the subset we need for
 * schematic + symbol export. Unsupported KiCad features are intentionally
 * out of scope — the consumer opens the output in KiCad for fine tuning.
 *
 * Format rules we enforce:
 *   - All tokens are lowercase identifiers ([a-z0-9_]+).
 *   - Strings are double-quoted, with \" and \\ escapes.
 *   - Numbers: integers without a decimal, floats with one.
 *   - No trailing whitespace; a single newline between children in pretty mode.
 */

export type SExp =
  | { kind: "atom"; value: string | number }
  | { kind: "string"; value: string }
  | { kind: "list"; tag: string; children: SExp[] };

const IDENT = /^[a-z][a-z0-9_]*$/;

export function atom(value: string | number): SExp {
  if (typeof value === "string" && !IDENT.test(value)) {
    throw new Error(
      `atom("${value}") is not a valid S-expression identifier; use str() for quoted strings`
    );
  }
  return { kind: "atom", value };
}

export function str(value: string): SExp {
  return { kind: "string", value };
}

export function node(tag: string, ...children: (SExp | SExp[] | undefined | null)[]): SExp {
  if (!IDENT.test(tag)) {
    throw new Error(`node("${tag}") — tag must match ${IDENT}`);
  }
  const flat: SExp[] = [];
  for (const c of children) {
    if (c == null) continue;
    if (Array.isArray(c)) flat.push(...c);
    else flat.push(c);
  }
  return { kind: "list", tag, children: flat };
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  // Trim trailing zeros but keep at least one decimal digit
  return n.toString().replace(/(\.\d*?)0+$/, "$1");
}

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export interface SerializeOptions {
  pretty?: boolean;
  indent?: number;
}

export function serialize(exp: SExp, options: SerializeOptions = {}): string {
  const { pretty = false, indent = 2 } = options;
  return pretty ? serializePretty(exp, 0, indent) : serializeInline(exp);
}

function serializeAtom(exp: SExp): string {
  if (exp.kind === "atom") {
    return typeof exp.value === "number" ? formatNumber(exp.value) : exp.value;
  }
  if (exp.kind === "string") {
    return `"${escapeString(exp.value)}"`;
  }
  return serializeInline(exp);
}

function serializeInline(exp: SExp): string {
  if (exp.kind !== "list") return serializeAtom(exp);
  if (exp.children.length === 0) return `(${exp.tag})`;
  const parts = [exp.tag, ...exp.children.map((c) => serializeInline(c))];
  return `(${parts.join(" ")})`;
}

function serializePretty(exp: SExp, depth: number, indent: number): string {
  if (exp.kind !== "list") return serializeAtom(exp);
  if (exp.children.length === 0) return `(${exp.tag})`;

  // Inline if the list is small and contains only atoms/strings
  const allScalar = exp.children.every((c) => c.kind !== "list");
  if (allScalar && exp.children.length <= 6) {
    return serializeInline(exp);
  }

  const pad = " ".repeat((depth + 1) * indent);
  const closePad = " ".repeat(depth * indent);
  const inner = exp.children
    .map((c) => pad + serializePretty(c, depth + 1, indent))
    .join("\n");
  return `(${exp.tag}\n${inner}\n${closePad})`;
}
