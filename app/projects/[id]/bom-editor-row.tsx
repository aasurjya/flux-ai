"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BomItem } from "@/types/project";

interface BomEditorRowProps {
  projectId: string;
  item: BomItem;
}

/**
 * Inline-edit BOM row. Click the pencil to edit name / quantity /
 * package / status in-place. Enter saves, Escape cancels. The PATCH
 * route validates and creates a revision so the edit is traceable.
 *
 * Keyboard-accessible: every control is tab-reachable; Enter confirms,
 * Escape rolls back to the original values.
 */
export function BomEditorRow({ projectId, item }: BomEditorRowProps) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({
    name: item.name,
    quantity: String(item.quantity),
    package: item.package,
    status: item.status
  });

  function resetDraft() {
    setDraft({
      name: item.name,
      quantity: String(item.quantity),
      package: item.package,
      status: item.status
    });
    setError(null);
  }

  function cancel() {
    resetDraft();
    setEditing(false);
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const q = Number(draft.quantity);
      if (!Number.isInteger(q) || q < 1) {
        setError("Quantity must be a positive integer");
        return;
      }
      const patch: Record<string, unknown> = {};
      if (draft.name !== item.name) patch.name = draft.name.trim();
      if (q !== item.quantity) patch.quantity = q;
      if (draft.package !== item.package) patch.package = draft.package.trim();
      if (draft.status !== item.status) patch.status = draft.status;
      if (Object.keys(patch).length === 0) {
        setEditing(false);
        return;
      }
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/bom/${encodeURIComponent(item.designator)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch)
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-border/70 bg-background/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="break-words font-medium text-foreground">
              {item.designator} — {item.name}
            </p>
            <p className="text-sm text-muted-foreground">
              Qty {item.quantity} · {item.package}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={item.status === "needs_review" ? "warning" : "secondary"}>
              {item.status.replaceAll("_", " ")}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Edit ${item.designator}`}
              onClick={() => setEditing(true)}
              className="border-transparent bg-transparent text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_100px_1fr_140px]">
        <span className="font-mono text-sm font-medium text-muted-foreground self-center">
          {item.designator}
        </span>
        <Input
          aria-label="Part name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={handleKey}
          disabled={saving}
        />
        <Input
          aria-label="Quantity"
          type="number"
          min={1}
          value={draft.quantity}
          onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          onKeyDown={handleKey}
          disabled={saving}
        />
        <Input
          aria-label="Package"
          value={draft.package}
          onChange={(e) => setDraft({ ...draft, package: e.target.value })}
          onKeyDown={handleKey}
          disabled={saving}
        />
        <select
          aria-label="Status"
          value={draft.status}
          onChange={(e) =>
            setDraft({ ...draft, status: e.target.value as BomItem["status"] })
          }
          onKeyDown={handleKey}
          disabled={saving}
          className="rounded-md border border-border bg-background/50 px-3 py-2 text-sm"
        >
          <option value="selected">selected</option>
          <option value="alternate">alternate</option>
          <option value="needs_review">needs review</option>
        </select>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={cancel}
          disabled={saving}
          aria-label="Cancel edit"
        >
          <X className="mr-1 h-4 w-4" />
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={saving}
          aria-label="Save BOM edit"
        >
          <Check className="mr-1 h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
