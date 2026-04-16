# Current cycle — flux.ai

**Cycle:** 6 shipped → cycle 7 queued
**Focus (cycle 7):** Phase 8 — telemetry counters + /admin/stats gated view

## Cycle 0 — bootstrap (2026-04-16) ✅

- [x] Created 3 new role agents: `ceo-founder`, `legal-compliance`, `head-of-product`
- [x] Created `.jarvis-org/` state directory (inbox/outbox/state + README + roster)
- [x] Wrote initial `roster.md`, `decisions.md`, `backlog.md`, `KPIs.md`, `org-memory.md`
- [x] Created `/jarvis-cycle` slash command
- [x] Cycle 1 executed

## Cycle 1 — Phase 1 shipped (2026-04-16) ✅

**Goal:** Wire KiCad schematic with net labels + power symbols.

- [x] CEO decision logged
- [x] Head of Product backlog + top story written
- [x] Dev implemented via TDD (5 new tests RED first, then GREEN)
- [x] Full regression: 198 unit + 36 E2E green, build exit 0
- [x] CEO closing review logged
- [x] Org-memory updated (R9, R10)
- [x] Single commit at end of cycle (f26c3f1)

## Cycle 2 — Phase 2 shipped (2026-04-16) ✅

**Goal:** Let users edit BOM rows in-place without the AI round-trip.

- [x] PATCH route with Zod strict partial validation (rejects designator hijack)
- [x] `patchBomItem` in store with revision + snapshot creation
- [x] BomEditorRow client component (Enter/Escape keyboard support, no-op save skipped)
- [x] Wired into workspace page; read-only BOM card removed
- [x] 6 route unit tests + 2 E2E tests
- [x] Full regression: 204 unit + 38 E2E, build exit 0
- [x] Org-memory updated (R11 — no-op early exit, R12 — Zod .strict() rejects hijacks)
- [x] Single commit at end of cycle (3f01c29)

**Outcome:** user flips BOM fields in <3s, every edit traceable via
revision. Biggest pre-export friction eliminated.

## Cycle 3 — Phase 3 shipped (2026-04-16) ✅

**Goal:** Let users silence known trade-offs on the validator panel.

- [x] Schema: optional `dismissed?: { at, reason }` on ValidationIssue (back-compat)
- [x] `setValidationDismissal` in store — reason:null re-enables
- [x] `carryDismissalsForward` helper + 5 unit tests (id match first, (severity,title) fallback)
- [x] `runImproveDesign` + `generateProject` carry forward dismissals across LLM re-runs
- [x] DismissValidationForm client component (two-step: × → reason → submit)
- [x] ReenableValidationForm client component (one-click)
- [x] Page.tsx: server actions + active/dismissed split with collapsed `<details>`
- [x] E2E: 2 new tests (dismiss with reason → re-enable; cancel/empty flow)
- [x] Full regression: 209 unit + 40 E2E green, build exit 0
- [x] Org-memory updated (R13 — Form action return type, R14 — carry user state across LLM re-runs)

**Outcome:** "No ESD on USB-C — it's a dev board" stays dismissed across
generate AND improve cycles. Signal-to-noise of the validation panel
restored.

## Cycle 4 — Phase 4 shipped (2026-04-16) ✅

**Goal:** Narrate the AI pipeline live via SSE instead of a blank 30s wait.

- [x] `onStage` callback on pipeline, `withStage` wrapper emits running/completed/error per stage
- [x] SSE route `app/api/projects/[id]/generate-stream/route.ts` (text/event-stream)
- [x] 3 unit tests (invalid id, full sequence, error path)
- [x] `GenerateStreamingButton` client component with live stage dropdown
- [x] Graceful fallback to classic form submit when EventSource unreachable
- [x] Page.tsx: replaced Generate form with streaming button
- [x] 2 E2E tests (SSE network assertion + disabled-during-pending)
- [x] Full regression: 214 unit + 42 E2E green, build exit 0
- [x] Org-memory: R15 (SSE id validation), R16 (revalidatePath in tests)

**Outcome:** User sees per-stage progress within ~100ms of clicking
Generate instead of a blank "Generating..." button for 30s.

## Cycle 5 — Phase 6 shipped (2026-04-16) ✅

**Goal:** Rules read structured BOM fields, not regex-on-prose.

- [x] `BomItem.value?` and `mpn?` added to types + schema
- [x] `parseValue()` helper handles 100nF / 10k / 4k7 / 4.7kΩ / 10µF etc.
- [x] `bomValueMatches(bom, "C", pred)` structured check
- [x] `DR-DECOUPLING` + `DR-I2C-PULLUP` check structured first, regex fallback
- [x] 6 new structured-rule tests (match, miss, regex-fallback for each rule)
- [x] BOM prompt tells LLM to emit `value` for every passive
- [x] suggest-bom + improve-design accept value/mpn through the schema
- [x] PATCH route accepts value/mpn with null-to-clear semantics
- [x] BOM editor UI: Value input + display badge, MPN shown under qty/pkg
- [x] Full regression: 222 unit + 42 E2E green, build exit 0
- [x] Org-memory: R17 (fallback path required), R18 (null vs undefined in patches)

**Outcome:** A paraphrase-heavy LLM BOM ("0.1µF MLCC X7R 0402") now
passes DR-DECOUPLING via structured `value: "100nF"`, where the old
regex would have missed it.

## Cycle 6 — Phase 7 shipped (2026-04-16) ✅

**Goal:** Enable improve-design to propose replacements, not only additions.

- [x] `applyBomEdits` treats same-designator collision as REPLACEMENT when any field differs
- [x] Identical re-assertion (all fields match) is a true no-op (no revision entry)
- [x] Stable `id` preserved across replacement so references don't break
- [x] Revision records "Replaced U1: old → new — rationale" as a single line
- [x] SYSTEM_PROMPT tells the LLM the mechanism exists
- [x] 6 improve-design tests green (previous collision test upgraded + new no-op test)
- [x] Full regression: 223 unit + 42 E2E green, build exit 0
- [x] Org-memory: R19 (silent-skip on collision is a bug)

**Outcome:** The LLM can now say "swap U1 for ESP32-C6" and the change
actually lands. Before, same-designator additions were silently dropped.

## Cycle 7 — scheduled

**Goal:** Phase 8 — telemetry counters + `/admin/stats` gated view.
**Entry criteria:** Cycle 6 committed; green gates.
**Rationale:** Six phases shipped, zero measurement. Every KPI in
`.jarvis-org/state/KPIs.md` is "unmeasured / qualitative only". The
next new feature has to instrument itself, or we're building blind.
File-based counter (no network), admin view gated behind
`FLUX_ADMIN_TOKEN` so the counters don't leak to unauthenticated users.

## Cycle log

Each run of `/jarvis-cycle` appends here.

- Cycle 0: bootstrap (agents + state + command) — 2026-04-16
- Cycle 1: Phase 1 (KiCad wires) shipped — 2026-04-16 (f26c3f1)
- Cycle 2: Phase 2 (inline BOM editing) shipped — 2026-04-16 (3f01c29)
- Cycle 3: Phase 3 (dismiss validations) shipped — 2026-04-16 (8567092)
- Cycle 4: Phase 4 (SSE streaming) shipped — 2026-04-16 (5bb68e8)
- Cycle 5: Phase 6 (structured BOM fields) shipped — 2026-04-16 (954b0e3)
- Cycle 6: Phase 7 (improve-design replacements) shipped — 2026-04-16 (pending commit)
