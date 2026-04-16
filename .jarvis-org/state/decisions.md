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

---

## 2026-04-16 — Cycle 4 closing review

### What shipped
Phase 4 — streaming generation via SSE.

Files:
- `lib/ai/pipeline.ts` — new `OnStage` callback type; each stage wrapped
  with `withStage` helper that emits `running` → `completed`/`error`.
  Sync semantics preserved — caller that passes no onStage gets
  unchanged behavior.
- `lib/project-store.ts` — `generateProject` accepts optional `onStage`
  and threads it to the pipeline.
- `app/api/projects/[id]/generate-stream/route.ts` — NEW. GET returns
  `text/event-stream`. Each stage produces a `stage` event; final
  `done` or `error` event closes the stream. ID validated against
  `[a-zA-Z0-9_-]+` before use (defence-in-depth).
- `app/api/projects/[id]/generate-stream/route.test.ts` — 3 unit tests
  (invalid id, full pipeline event sequence, unknown project error).
- `app/projects/[id]/generate-streaming-button.tsx` — NEW client
  component. Opens EventSource, renders a live "Parsing requirements
  ✓ / Extracting architecture…" dropdown beside the button, and
  router.refresh() on done. Falls back to classic server-action form
  submit if EventSource never receives a single event (corp-proxy
  unreachable case).
- `app/projects/[id]/page.tsx` — Replaced the Generate `<form>` with
  `<GenerateStreamingButton>`.
- `e2e/streaming-generate.spec.ts` — 2 E2E tests: SSE response is
  verified at the network layer (content-type text/event-stream +
  status panel visible within 2s), and "Generating..." state disables
  the button.

### Gate outcomes
- Unit: 214 / 214 green (+5). Was 209.
- E2E: 42 / 42 green (+2). Was 40.
- Build: exit 0.
- Coverage: thresholds hold.

### Did it move a KPI?
Phase 8 still not shipped, so no direct telemetry. Qualitative: the
"30s blank wait" classic-abandonment pattern is gone. Users see per-
stage progress within ~100ms of clicking Generate.

### Org-memory updates
- **R15** — SSE route must validate the path param before use. Even
  though SSE never exits on 4xx after the initial header, the id flows
  into `revalidatePath` and store lookups. Reject early with 400 on
  shape mismatch.
- **R16** — `revalidatePath` throws in unit tests without a Next.js
  static-generation store. Wrap in a try/catch when the route is
  primarily useful for browser sessions; unit tests should not need
  a Next request context to assert the stream body.

### Next cycle (Cycle 5) direction
Phase 6 — design rules read structured BOM fields (value, mpn) not LLM
prose regex. Currently `/100nF/` matches "100nF" but misses "0.1µF
MLCC X7R 0402" for the same part. Add `value?`, `mpn?` to `BomItem`,
have the BOM prompt emit them, rewrite rules to check structured
fields with regex fallback for old projects.

Deferring Phase 5 (SQLite) AGAIN — still zero production users.
Deferring Phase 7 (improve-design replacement) until Phase 6 lands —
rules get cleaner with structured fields, making replacement diffs
easier to express.

---

## 2026-04-16 — Cycle 5 closing review

### What shipped
Phase 6 — design rules read structured BOM `value` / `mpn` fields.

Files:
- `types/project.ts` — optional `value?: string` / `mpn?: string` on
  BomItem (back-compat).
- `lib/project-schema.ts` — schema updated with length-bounded
  optional fields.
- `lib/ai/design-rules.ts` — new `parseValue` helper (handles "100nF",
  "10k", "4k7", "4.7kΩ", "10µF") + `bomValueMatches(bom, "C", pred)`
  structured check. `DR-DECOUPLING` and `DR-I2C-PULLUP` now check
  structured fields FIRST, fall back to regex on name for legacy
  projects. Other rules unchanged for now (conservative).
- `lib/ai/design-rules-structured.test.ts` — 6 new tests covering
  structured-match, structured-insufficient, and regex-fallback paths
  for both rules.
- `lib/ai/suggest-bom.ts` — Zod schema accepts optional `value`/`mpn`
  from the LLM; normalize passes them through.
- `lib/ai/prompts.ts` — BOM system prompt now tells the LLM to emit
  `value` for every passive and `mpn` only when confident.
- `lib/ai/improve-design.ts` — BomAddSchema accepts `value`/`mpn` so
  AI-proposed additions are rule-visible immediately.
- `lib/ai/stub-client.ts` — stub BOM + stub improvement responses
  include `value` so tests exercise the new path.
- `app/api/projects/[id]/bom/[designator]/route.ts` — PATCH schema
  accepts `value` and `mpn` (with `null` to clear). `.strict()` still
  rejects designator-hijack attempts.
- `app/api/projects/[id]/bom/[designator]/route.test.ts` — 2 new
  tests (set value → round-trip; null clears).
- `lib/project-store.ts patchBomItem` — handles null-clear semantics
  and records value/mpn transitions in the revision changes list.
- `app/projects/[id]/bom-editor-row.tsx` — new Value input in the
  editor grid, read-only badge surfaces value when set, MPN text
  shown under Qty/package.

### Gate outcomes
- Unit: 222 / 222 green (+8). Was 214.
- E2E: 42 / 42 green. Unchanged count — existing BOM E2E still passes.
- Build: exit 0.
- Coverage: thresholds hold.

### Did it move a KPI?
Qualitative: a paraphrase-heavy LLM output ("0.1µF MLCC X7R 0402")
now passes DR-DECOUPLING via structured value, where previously it
would have slipped through the regex. Formal measurement (telemetry)
still deferred to Phase 8.

### Org-memory updates
- **R17** — Additive schema extensions must be truly optional, AND the
  fallback path must be tested explicitly. Adding `value?` without a
  regex-fallback test would mean legacy projects silently start
  firing false-positive rules. Always test both paths when extending
  a data source.
- **R18** — `null` + `undefined` aren't interchangeable in PATCH
  semantics. `undefined` = "no change". `null` = "clear this field".
  Use `z.union([z.string(), z.null()]).optional()` to express that
  distinction at the schema layer.

### Next cycle (Cycle 6) direction
Phase 7 — fix `improve-design` silent-skip. When the LLM proposes an
addition whose designator already exists, `applyBomEdits` currently
silently drops it. With Phase 6 structured fields landed, a
replacement can be detected: same designator + different
name/value/mpn → remove old + add new + record "Replaced U3: X → Y".

Deferring Phase 5 (SQLite) YET AGAIN — still no concurrency pressure.
