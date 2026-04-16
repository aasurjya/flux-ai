/**
 * Shared builder for AI pipeline user messages.
 *
 * Every pipeline step (parse-requirements, clarify, generate-architecture,
 * suggest-bom, validate, improve-design) assembles a user prompt from the
 * same building blocks: brief, constraints, requirements, architecture,
 * BOM, plus a step-specific instruction. This builder produces a
 * consistent markdown-formatted message from those parts.
 */

interface Section {
  title: string;
  /** Render each item as a `- item` line. */
  items?: string[];
  /** Render as a text block (trimmed). */
  text?: string;
  /** Shown when items is empty. If omitted and items is empty, section is skipped. */
  emptyLabel?: string;
}

interface BuildUserMessageInput {
  sections: Section[];
  instruction: string;
}

export function buildUserMessage({ sections, instruction }: BuildUserMessageInput): string {
  const lines: string[] = [];

  for (const section of sections) {
    const hasItems = section.items && section.items.length > 0;
    const hasText = section.text && section.text.trim().length > 0;
    const hasEmpty = section.emptyLabel;

    if (!hasItems && !hasText && !hasEmpty) continue;

    if (lines.length > 0) lines.push("");
    lines.push(`# ${section.title}`);

    if (hasText) {
      lines.push(section.text!.trim());
    } else if (hasItems) {
      lines.push(section.items!.map((item) => `- ${item}`).join("\n"));
    } else if (hasEmpty) {
      lines.push(section.emptyLabel!);
    }
  }

  lines.push("", instruction);
  return lines.join("\n");
}
