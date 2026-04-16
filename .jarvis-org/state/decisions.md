# Decisions — flux.ai

Append-only log of CEO / CTO / cross-role decisions.
Newest at the bottom. Older decisions never edited — if wrong, write a
new entry that supersedes them and say so.

---

## 2026-04-16 — Cycle 0 (bootstrap)

### Org established
Bootstrap the agent-driven organization. Roster and state files created.
Phase plan (P1–P8 in `~/.claude/plans/twinkling-swinging-kitten.md`)
remains the source of truth for engineering backlog.

### Ship next
Phase 1 — wire KiCad schematic with net labels + power symbols.

**Because:** Both review agents converged on "schematic has no wires"
as the single biggest credibility leak. Opens as scattered rectangles,
destroys trust instantly. Without this, every other improvement is
invisible. See `.jarvis-org/state/KPIs.md` T2 — "KiCad-open success
rate" — currently unmeasured but qualitatively broken.

**Assigned to:** tdd-guide (dev) + architect (review)
**Acceptance:** Generated `.kicad_sch` opens in KiCad 8 with every
connected block reachable via labeled nets; power blocks render as
`power:+3V3` / `power:GND` stdlib symbols.
**Timebox:** Cycle 1.

### Kill / defer
**Defer: Phase 5 (SQLite migration).**

**Because:** Zero production users means the concurrency window is
zero. Ship user-visible credibility (Phase 1) first; harden persistence
when the second real user arrives.

### Open question blocking speed
Do users actually OPEN the KiCad export, or treat the BOM CSV as the
primary output? (Telemetry lands in Phase 8 — we'll know by then.)

### Review of the last cycle's decisions
N/A — this is cycle 0.

---

## 2026-04-16 — Cycle 1 closing review

### What shipped
Phase 1 — KiCad schematic net labels + power symbols.

Commit: (single-commit-per-cycle convention, see git log)
Files touched:
- `lib/kicad/netlist-gen.ts` — exported netNameFor / uniqueEdges / buildBlockRefMap so schematic-gen can reuse them without duplication
- `lib/kicad/schematic-gen.ts` — added global_label emission per unique edge, KiCad stdlib power symbols for power-kind blocks, powerLibIdFor mapping
- `lib/kicad/schematic-gen.test.ts` — 5 new assertions (labels per edge, power +3V3, power +5V, power VBUS, no-power no-symbol, no-connections no-labels)

### Gate outcomes
- Unit tests: 198 / 198 green (was 193)
- Build: exit 0
- E2E: 36 / 36 green
- Coverage: thresholds hold

### Did it move a KPI?
No — KPIs T2 ("KiCad-open success rate") and A1 ("users who open the
exported file") are still unmeasured (Phase 8 not shipped). The
qualitative signal — "schematic is no longer scattered rectangles" —
is confirmed by the test output. Formal telemetry is deferred.

### Org-memory update
R8 added (durable rule): "Schematic artifact changes require manual
KiCad 8 open-test in addition to unit tests." Filed in
`.jarvis-org/state/org-memory.md` under durable rules.

### Next cycle (Cycle 2) direction
Phase 2 — inline BOM editing. The user should be able to flip a
"needs_review" to "selected" in <3s without touching AI. This is the
second-biggest friction point in the product-intel audit.

Deferred again: SQLite migration (Phase 5). Zero production users =
zero concurrency pressure. Will revisit when a second real user
appears.

---

## 2026-04-16 — Cycle 2 closing review

### What shipped
Phase 2 — inline BOM editing with revision trail.

Commit: 3f01c29.
Files:
- `app/api/projects/[id]/bom/[designator]/route.ts` — PATCH route with
  Zod `.strict()` partial schema. Rejects unknown fields (including
  attempts to hijack the designator via the body).
- `lib/project-store.ts patchBomItem()` — `withStoreLock`, merges only
  user-editable fields, builds human-readable change list, creates
  revision + snapshot.
- `app/projects/[id]/bom-editor-row.tsx` — client component. Pencil
  → Enter saves, Escape cancels. No-op saves exit early.
- 6 route unit tests + 2 E2E tests.

### Gate outcomes
- Unit: 204 / 204 green (+6). Was 198.
- E2E: 38 / 38 green (+2). Was 36.
- Build: exit 0.
- Coverage: thresholds hold.

### Did it move a KPI?
Not yet (Phase 8 telemetry not shipped). Qualitative: the "forced to
re-run AI for every BOM correction" friction from the product-intel
audit is gone.

### Org-memory updates
- **R11** — No-op edits must exit early on both client and server.
- **R12** — Zod `.strict()` rejects hijack attempts at the schema layer.

### Next cycle (Cycle 3) direction
Phase 3 — dismiss validation issues. Users need to silence known
trade-offs or the validator panel becomes ignored noise.

---

## 2026-04-16 — Cycle 3 closing review

### What shipped
Phase 3 — dismiss validation issues + rule respects dismissed state.

Files:
- `types/project.ts` — `ValidationIssue.dismissed?: { at; reason }` (back-compat optional).
- `lib/project-schema.ts` — `dismissed` on `ValidationIssueSchema`.
- `lib/ai/carry-dismissals.ts` + tests — pure helper matches prior dismissals by id first, then (severity, title) fallback. 5 tests.
- `lib/project-store.ts` — new `setValidationDismissal({ projectId, validationId, reason })`. `reason: null` re-enables. `runImproveDesign` + `generateProject` now call `carryDismissalsForward(next, prior)` so dismissals survive re-runs of the LLM.
- `app/projects/[id]/dismiss-validation-form.tsx` — two-step dismiss: × reveals reason textarea, submit creates revision with the reason. Empty reason disables submit.
- `app/projects/[id]/reenable-validation-form.tsx` — one-click re-enable (wrapped action matches React `<form>` void signature).
- `app/projects/[id]/page.tsx` — server actions `dismissValidationAction` + `reenableValidationAction`. Validation card split: active (with × buttons) + collapsed `<details>` "Dismissed (N)" with reason + re-enable buttons.
- `e2e/dismiss-validation.spec.ts` — 2 new tests (dismiss → reason required → re-enable; cancel/empty flow).

### Gate outcomes
- Unit: 209 / 209 green (+5). Was 204.
- E2E: 40 / 40 green (+2). Was 38.
- Build: exit 0.
- Coverage: thresholds hold.

### Did it move a KPI?
Phase 8 still not shipped, so direct telemetry absent. Qualitative:
the "same ignored warning on every generate" friction is gone. Users
can mark "No ESD — dev board" and it STAYS dismissed across generate
and improve cycles (carryDismissalsForward verified by unit tests).

### Org-memory updates
- **R13** — Client-side server-action wrappers need a `Promise<void>` return type. React's `<form action>` signature won't accept `Promise<{ error? } | void>` directly. Wrap the action with a thin `async (fd) => { await action(fd); }` adapter when the server action needs to return an error object to a parent client component.
- **R14** — User-state fields (dismissals, user edits) must be carried forward across LLM re-runs. Re-runs produce fresh arrays; without a carryForward merge, every generate resets the user's work. Match first by stable id, fall back to (severity, title) tuple for items LLM regenerates with a new id.

### Next cycle (Cycle 4) direction
Phase 4 — streaming generation via SSE. Users currently wait ~30s
with a generic spinner; the 5-stage pipeline should narrate progress
("Parsing requirements ✓ / Extracting architecture…"). Product-intel
identified this as #3 pre-export friction after BOM editing and
dismissals.

Deferred again: Phase 5 (SQLite). Still zero users; still no
concurrency pressure. Revisit when second real user appears.
