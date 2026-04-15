# Backlog — flux.ai

Owned by: `head-of-product`.
Updated: 2026-04-16 (cycle 0).

The canonical engineering phase plan is at
`~/.claude/plans/twinkling-swinging-kitten.md`. This backlog is the
**head-of-product's refinement** of that plan against real customer
signal. When signal is absent, it mirrors the phase plan.

## Next (committed this cycle)

### 1. Wire KiCad schematic (Phase 1 of the plan)
**Score:** 9/10
**Evidence:** Both review agents (socratic-challenger + product-intel)
flagged this as the single biggest credibility leak. No telemetry yet;
escalating on qualitative signal.
**Owner:** tdd-guide (dev) + architect (review)
**Story:** see below.

## Up next (ordered, not committed this cycle)

2. **BOM inline editing** (Phase 2) — evidence: "users must accept or re-run AI" friction flagged by product-intel
3. **Dismiss validations** (Phase 3) — evidence: noise drowns signal; standard in every linter
4. **Streaming generation progress** (Phase 4) — evidence: 30s blank wait is classic abandonment
5. **Rules read structured fields** (Phase 6) — evidence: regex-on-prose fragility unmeasured
6. **Improve-design replacement support** (Phase 7) — evidence: silent-skip bug on same-designator additions
7. **Telemetry + `/admin/stats`** (Phase 8) — evidence: we're flying blind on all KPIs

## Parking lot

- **Interactive circuit graph** (product-intel's contrarian take) — premature without Phase 8 telemetry
- **SQLite migration** (Phase 5) — defer per CEO decision until concurrency bites
- **Kill JSON import/export** (product-intel kill recommendation) — disagreed; keep, zero maintenance cost
- **Live Anthropic API smoke test** — needs API key and a small budget

## Killed this cycle

None yet (cycle 0).

## Stories

### 1. Wire KiCad schematic with net labels + power symbols

**As an** indie hardware engineer opening my first flux.ai-generated `.kicad_sch`
**I want** to see blocks connected by visible labeled nets (VCC_3V3, I2C_BUS, SWD, …)
**So that** I don't see scattered rectangles and close the tab immediately.

**Acceptance criteria:**
- [ ] Every unique edge in `architectureBlocks[].connections` emits a KiCad `(global_label "NET_NAME" …)` at both endpoints
- [ ] Net name reuses the semantic logic already in `lib/kicad/netlist-gen.ts:netNameFor` (VCC_3V3 / VBUS_IN / I2C_BUS / SPI_BUS / UART / SWD / …)
- [ ] Power-kind blocks render with a KiCad stdlib `(power …)` symbol (`power:+3V3`, `power:GND`, `power:+5V`, `power:VBUS`) in addition to their placed lib symbol
- [ ] `lib/kicad/sexp.ts` gains helpers for `global_label` and power-symbol placement
- [ ] Existing `lib/kicad/schematic-gen.test.ts` passes; 3+ new tests for label emission + power symbol placement
- [ ] `npx playwright test` still green
- [ ] Coverage thresholds hold (80% lines / 75% branches)
- [ ] Open the generated `.kicad_sch` in KiCad 8 manually (user verification) — no red no-connect markers

**Out of scope:**
- Actual routed wire geometry between symbols (labels connect by name; KiCad's ERC is happy)
- Pin-level footprint assignment
- Multi-sheet hierarchy

**Evidence / references:**
- product-intel Session 2 improvement-plan, finding #2
- socratic-challenger Session 2, question #3 ("what does KiCad-ready actually mean?")
- Plan file Phase 1
