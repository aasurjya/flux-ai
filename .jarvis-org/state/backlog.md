# Backlog — flux.ai

Owned by: `head-of-product`.
Updated: 2026-04-16 (cycle 0).

The canonical engineering phase plan is at
`~/.claude/plans/twinkling-swinging-kitten.md`. This backlog is the
**head-of-product's refinement** of that plan against real customer
signal. When signal is absent, it mirrors the phase plan.

## Next (committed this cycle)

### 1. Improve-design replacement support (Phase 7 of the plan)
**Score:** 8/10
**Evidence:** `applyBomEdits` silently drops additions whose
designator collides with an existing item. Means the LLM can never
say "swap U3 for a better LDO" — the user thinks improve-design did
nothing. Phase 6 structured fields now let us detect replacements
(same designator + different value/name/mpn = replace).
**Owner:** tdd-guide (dev) + architect (review)
**Story:** see below.

## Up next (ordered, not committed this cycle)

2. **Telemetry + `/admin/stats`** (Phase 8) — evidence: we're flying blind on all KPIs

## Parking lot

- **Interactive circuit graph** (product-intel's contrarian take) — premature without Phase 8 telemetry
- **SQLite migration** (Phase 5) — defer per CEO decision until concurrency bites
- **Kill JSON import/export** (product-intel kill recommendation) — disagreed; keep, zero maintenance cost
- **Live Anthropic API smoke test** — needs API key and a small budget

## Killed this cycle

None yet (cycle 0).

## Shipped in earlier cycles

- **Cycle 1 — Phase 1 KiCad net labels + power symbols** ✅ (commit f26c3f1)
- **Cycle 2 — Phase 2 inline BOM editing** ✅ (commit 3f01c29)
- **Cycle 3 — Phase 3 dismiss validation issues** ✅ (commit 8567092)
- **Cycle 4 — Phase 4 streaming generation via SSE** ✅ (commit 5bb68e8)
- **Cycle 5 — Phase 6 structured BOM fields** ✅ (this cycle)

## Stories

### 1. Improve-design replacement support

**As a** user clicking "Improve design"
**I want** the LLM to be able to propose "swap U3 for a better LDO"
**So that** improve-design can upgrade a design rather than only ever adding new parts.

**Acceptance criteria:**
- [ ] `applyBomEdits` detects same-designator additions and treats them as replacements when `name`, `value`, or `mpn` differs
- [ ] Replacement records BOTH the removal AND the addition as `Replaced U3: X → Y` in the revision.changes list (one entry, not two)
- [ ] SYSTEM_PROMPT of improve-design tells the LLM this mechanism exists so it proposes replacements naturally
- [ ] Tests: improve-design proposes a replacement → result BOM has the new part at the same designator + revision explains the replacement
- [ ] Edge: if LLM proposes an addition identical to existing (same name/value/mpn), still silently skip (it's a no-op)
- [ ] Coverage thresholds hold.

**Out of scope:**
- Multi-way swaps (A ↔ B at same time)
- Revert-a-replacement UI (future)

**Evidence / references:**
- Plan file Phase 7
- socratic-challenger finding: silent-skip bug on same-designator additions
