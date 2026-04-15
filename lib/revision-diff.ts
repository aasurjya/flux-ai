import type { BomItem, CircuitBlock, RevisionSnapshot, ValidationIssue } from "@/types/project";

/**
 * Structured delta between two revision snapshots.
 *
 * Matching strategy:
 *   - BOM: by `designator` (stable human-facing ref; id changes when
 *     the LLM re-emits the same logical part with a fresh UUID, which
 *     shouldn't count as a change)
 *   - Validations: by `id` (stable: DR rule issue ids are deterministic,
 *     LLM validator ids are UUIDs that stay put across revisions)
 *   - Architecture blocks: by `id`
 *
 * The `changed` set on BOM captures same-designator entries whose name,
 * package, quantity, or status differs — everything except id (ids
 * churn harmlessly across revisions).
 */

export interface BomChange {
  designator: string;
  before: BomItem;
  after: BomItem;
}

export interface RevisionDiff {
  bom: {
    added: BomItem[];
    removed: BomItem[];
    changed: BomChange[];
  };
  validations: {
    resolved: ValidationIssue[]; // in older, gone in newer
    introduced: ValidationIssue[]; // in newer, not in older
  };
  blocks: {
    added: CircuitBlock[];
    removed: CircuitBlock[];
  };
  /** Flat count — useful for a "N changes" summary in the UI */
  totalChanges: number;
}

function sameBomExceptId(a: BomItem, b: BomItem): boolean {
  return (
    a.designator === b.designator &&
    a.name === b.name &&
    a.package === b.package &&
    a.quantity === b.quantity &&
    a.status === b.status
  );
}

export function computeRevisionDiff(
  older: RevisionSnapshot,
  newer: RevisionSnapshot
): RevisionDiff {
  // BOM diff by designator
  const olderByDes = new Map(older.bom.map((b) => [b.designator, b]));
  const newerByDes = new Map(newer.bom.map((b) => [b.designator, b]));

  const bomAdded: BomItem[] = [];
  const bomRemoved: BomItem[] = [];
  const bomChanged: BomChange[] = [];

  for (const [des, newerItem] of newerByDes.entries()) {
    const olderItem = olderByDes.get(des);
    if (!olderItem) {
      bomAdded.push(newerItem);
    } else if (!sameBomExceptId(olderItem, newerItem)) {
      bomChanged.push({ designator: des, before: olderItem, after: newerItem });
    }
  }
  for (const [des, olderItem] of olderByDes.entries()) {
    if (!newerByDes.has(des)) bomRemoved.push(olderItem);
  }

  // Validations by id
  const olderValIds = new Set(older.validations.map((v) => v.id));
  const newerValIds = new Set(newer.validations.map((v) => v.id));
  const resolved = older.validations.filter((v) => !newerValIds.has(v.id));
  const introduced = newer.validations.filter((v) => !olderValIds.has(v.id));

  // Blocks by id
  const olderBlocks = older.architectureBlocks ?? [];
  const newerBlocks = newer.architectureBlocks ?? [];
  const olderBlockIds = new Set(olderBlocks.map((b) => b.id));
  const newerBlockIds = new Set(newerBlocks.map((b) => b.id));
  const blocksAdded = newerBlocks.filter((b) => !olderBlockIds.has(b.id));
  const blocksRemoved = olderBlocks.filter((b) => !newerBlockIds.has(b.id));

  const totalChanges =
    bomAdded.length +
    bomRemoved.length +
    bomChanged.length +
    resolved.length +
    introduced.length +
    blocksAdded.length +
    blocksRemoved.length;

  return {
    bom: { added: bomAdded, removed: bomRemoved, changed: bomChanged },
    validations: { resolved, introduced },
    blocks: { added: blocksAdded, removed: blocksRemoved },
    totalChanges
  };
}
