import { GitCompare } from "lucide-react";
import type { ProjectRevision } from "@/types/project";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { computeRevisionDiff } from "@/lib/revision-diff";

interface RevisionCompareProps {
  older: ProjectRevision;
  newer: ProjectRevision;
}

/**
 * Side-by-side structured diff between two project revisions.
 * Renders:
 *   - BOM changes: added (green +) / removed (red −) / modified (yellow ~)
 *   - Validations: resolved (green) / introduced (amber)
 *   - Architecture blocks: added / removed
 *
 * Older revisions without `snapshot` are excluded upstream — this
 * component assumes both sides have snapshots.
 */
export function RevisionCompare({ older, newer }: RevisionCompareProps) {
  if (!older.snapshot || !newer.snapshot) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-4 w-4" />
            Comparison unavailable
          </CardTitle>
          <CardDescription>
            One or both revisions were created before revision snapshots were
            tracked. Compare newer revisions to see structured diffs.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const diff = computeRevisionDiff(older.snapshot, newer.snapshot);

  return (
    <Card className="border-primary/30 bg-card/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-4 w-4" />
          {older.title} → {newer.title}
        </CardTitle>
        <CardDescription>
          {diff.totalChanges === 0
            ? "No structural differences — revisions are identical."
            : `${diff.totalChanges} structural change${diff.totalChanges === 1 ? "" : "s"} between these revisions.`}
        </CardDescription>
      </CardHeader>
      {diff.totalChanges > 0 && (
        <CardContent className="space-y-5 text-sm">
          {(diff.bom.added.length + diff.bom.removed.length + diff.bom.changed.length) > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                BOM
              </h4>
              <ul className="space-y-1.5">
                {diff.bom.added.map((item) => (
                  <li
                    key={`added-${item.designator}`}
                    className="flex gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1"
                  >
                    <span className="font-mono font-bold text-emerald-400">+</span>
                    <span className="break-words">
                      <span className="font-medium">{item.designator}</span> — {item.name} ({item.package})
                    </span>
                  </li>
                ))}
                {diff.bom.removed.map((item) => (
                  <li
                    key={`removed-${item.designator}`}
                    className="flex gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-1"
                  >
                    <span className="font-mono font-bold text-rose-400">−</span>
                    <span className="break-words">
                      <span className="font-medium">{item.designator}</span> — {item.name}
                    </span>
                  </li>
                ))}
                {diff.bom.changed.map((c) => (
                  <li
                    key={`changed-${c.designator}`}
                    className="flex gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1"
                  >
                    <span className="font-mono font-bold text-amber-400">~</span>
                    <span className="break-words">
                      <span className="font-medium">{c.designator}</span>: {c.before.name} → {c.after.name}
                      {c.before.package !== c.after.package ? ` (${c.before.package} → ${c.after.package})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(diff.validations.resolved.length + diff.validations.introduced.length) > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Validations
              </h4>
              <ul className="space-y-1.5">
                {diff.validations.resolved.map((v) => (
                  <li key={`resolved-${v.id}`} className="flex items-start gap-2">
                    <Badge variant="secondary" className="shrink-0">resolved</Badge>
                    <span className="break-words">{v.title}</span>
                  </li>
                ))}
                {diff.validations.introduced.map((v) => (
                  <li key={`intro-${v.id}`} className="flex items-start gap-2">
                    <Badge variant="warning" className="shrink-0">introduced</Badge>
                    <span className="break-words">{v.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(diff.blocks.added.length + diff.blocks.removed.length) > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Architecture blocks
              </h4>
              <ul className="space-y-1.5">
                {diff.blocks.added.map((b) => (
                  <li key={`blk-add-${b.id}`} className="flex gap-2">
                    <span className="font-mono font-bold text-emerald-400">+</span>
                    <span>{b.label} <span className="text-muted-foreground">({b.kind})</span></span>
                  </li>
                ))}
                {diff.blocks.removed.map((b) => (
                  <li key={`blk-rem-${b.id}`} className="flex gap-2">
                    <span className="font-mono font-bold text-rose-400">−</span>
                    <span>{b.label} <span className="text-muted-foreground">({b.kind})</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      )}
    </Card>
  );
}
