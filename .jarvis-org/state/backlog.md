# Backlog — flux.ai

Owned by: `head-of-product`.
Updated: 2026-04-16 (cycle 0).

The canonical engineering phase plan is at
`~/.claude/plans/twinkling-swinging-kitten.md`. This backlog is the
**head-of-product's refinement** of that plan against real customer
signal. When signal is absent, it mirrors the phase plan.

## Next (committed this cycle)

### 1. Structured BOM fields for rules (Phase 6 of the plan)
**Score:** 8/10
**Evidence:** Current regex-on-prose rules like `/100nF/i` match the
string "100nF" but miss "0.1µF MLCC X7R 0402" for the SAME part.
Coverage is 91% but on hand-crafted inputs, not LLM paraphrase. Real
LLM output has unpredictable naming. Structured fields (`value`, `mpn`)
let rules check data instead of stringified shapes.
**Owner:** tdd-guide (dev) + architect (review)
**Story:** see below.

## Up next (ordered, not committed this cycle)

2. **Improve-design replacement support** (Phase 7) — evidence: silent-skip bug on same-designator additions
3. **Telemetry + `/admin/stats`** (Phase 8) — evidence: we're flying blind on all KPIs

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
- **Cycle 4 — Phase 4 streaming generation via SSE** ✅ (this cycle)

## Stories

### 1. Structured BOM fields for deterministic rules

**As a** developer of the design-rules engine
**I want** rules to read structured `value` and `mpn` fields on BOM items
**So that** LLM paraphrase variants don't silently bypass the rule.

**Acceptance criteria:**
- [ ] `BomItem` gains optional `value?: string` ("100nF", "10k") and `mpn?: string`
- [ ] `BomItemSchema` updated (back-compat: both optional)
- [ ] `suggest-bom.ts` system prompt emits `value` for every passive, `mpn` when confident
- [ ] Rules rewritten to check structured fields:
  - `DR-DECOUPLING`: any `C*` with `value === "100nF"`
  - `DR-I2C-PULLUP`: any `R*` with `value` that parses as `>= 4.7k`
  - (similar for RESET, PROGRAMMING-HEADER where applicable)
- [ ] Regex fallback preserved for old projects where `value` is absent — no silent regression on existing data
- [ ] Tests: per rule, add structured-BOM-passes tests with deliberately obtuse `name` ("0.1µF MLCC X7R 0402") + correct `value: "100nF"`. Both paths (structured-hit + regex-fallback) asserted.
- [ ] Coverage thresholds hold.

**Out of scope:**
- Migrating historical JSON files to add `value` fields (lazy only)
- Manufacturer-part-number validation against distributor APIs (future)

**Evidence / references:**
- socratic-challenger finding #2 (design-rule regex fragility unmeasured)
- Plan file Phase 6
