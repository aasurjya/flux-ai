import type { ValidationIssue } from "@/types/project";

/**
 * When the validator re-runs (improveDesign, generateProject), issues
 * that the user previously dismissed as known trade-offs should stay
 * dismissed — otherwise the validator panel becomes noise every cycle.
 *
 * Matching strategy:
 *   1. Exact id match — primary. IDs are stable for the same rule+title.
 *   2. (severity, title-normalised) fallback — catches cases where the
 *      underlying id regenerated but the same rule produced an issue
 *      with the same human-readable title.
 *
 * If the new issue already has a `dismissed` field (e.g. was set by a
 * concurrent operation), that wins — we don't overwrite fresh state
 * with older state.
 */
export function carryDismissalsForward(
  next: ValidationIssue[],
  prior: ValidationIssue[]
): ValidationIssue[] {
  if (prior.length === 0) return next;

  const priorById = new Map<string, ValidationIssue>();
  const priorByKey = new Map<string, ValidationIssue>();
  for (const p of prior) {
    if (!p.dismissed) continue;
    priorById.set(p.id, p);
    priorByKey.set(keyOf(p), p);
  }
  if (priorById.size === 0) return next;

  return next.map((n) => {
    if (n.dismissed) return n; // new state wins; don't overwrite
    const match = priorById.get(n.id) ?? priorByKey.get(keyOf(n));
    if (!match || !match.dismissed) return n;
    return { ...n, dismissed: match.dismissed };
  });
}

function keyOf(v: ValidationIssue): string {
  return `${v.severity}::${v.title.trim().toLowerCase()}`;
}
