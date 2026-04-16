# Backlog — flux.ai

Owned by: `head-of-product`.
Updated: 2026-04-16 (cycle 0).

The canonical engineering phase plan is at
`~/.claude/plans/twinkling-swinging-kitten.md`. This backlog is the
**head-of-product's refinement** of that plan against real customer
signal. When signal is absent, it mirrors the phase plan.

## Next (committed this cycle)

### 1. Dismiss validations (Phase 3 of the plan)
**Score:** 8/10
**Evidence:** Standard capability in every linter (ESLint, RuboCop,
Pylint). Currently our validator re-fires the same warnings every
improve-design cycle; users will learn to ignore the panel and real
signals get lost in the noise.
**Owner:** tdd-guide (dev) + architect (review)
**Story:** see below.

## Up next (ordered, not committed this cycle)

2. **Streaming generation progress** (Phase 4) — evidence: 30s blank wait is classic abandonment
3. **Rules read structured fields** (Phase 6) — evidence: regex-on-prose fragility unmeasured
4. **Improve-design replacement support** (Phase 7) — evidence: silent-skip bug on same-designator additions
5. **Telemetry + `/admin/stats`** (Phase 8) — evidence: we're flying blind on all KPIs

## Parking lot

- **Interactive circuit graph** (product-intel's contrarian take) — premature without Phase 8 telemetry
- **SQLite migration** (Phase 5) — defer per CEO decision until concurrency bites
- **Kill JSON import/export** (product-intel kill recommendation) — disagreed; keep, zero maintenance cost
- **Live Anthropic API smoke test** — needs API key and a small budget

## Killed this cycle

None yet (cycle 0).

## Shipped in earlier cycles

- **Cycle 1 — Phase 1 KiCad net labels + power symbols** ✅ (commit f26c3f1)
- **Cycle 2 — Phase 2 inline BOM editing** ✅ (this cycle)

## Stories

### 1. Dismiss validation issues with reason

**As a** hardware engineer working through a list of validation warnings
**I want** to dismiss issues I've accepted as known trade-offs (with a brief reason)
**So that** the next generate / improve cycle doesn't re-fire them as noise, and real problems stay visible.

**Acceptance criteria:**
- [ ] `ValidationIssue` type gains optional `dismissed?: { at: string; reason: string }` field
- [ ] `ValidationIssueSchema` updated in `lib/project-schema.ts` (back-compat: field is optional)
- [ ] New server action on workspace: `dismissValidationAction` takes validation id + reason, mutates outputs.validations, creates a revision explaining the dismissal
- [ ] UI: active issues show a "Dismiss…" affordance that opens a small reason textarea; dismissed issues collapse into a "Dismissed (N)" section with a "Re-enable" button
- [ ] `runDesignRules` respects prior dismissals: a rule that fired and was dismissed shouldn't re-fire on the next run UNLESS the underlying BOM / architecture changed in a way that would make the rule fire for a different reason. Identity key = `rule + slug(title)`.
- [ ] Tests: unit — dismiss persists across `runDesignRules` re-runs when state unchanged; dismiss invalidates when underlying BOM changes. E2E — dismiss a validation, run improve-design, confirm it stays dismissed.
- [ ] Coverage thresholds hold.

**Out of scope:**
- Bulk-dismiss UI (one at a time is fine for MVP)
- Dismiss-suggestion from the AI itself (could be a Phase 4 follow-up)

**Evidence / references:**
- product-intel Session 2 improvement-plan, finding #5
- Standard linter pattern (ESLint rule disable, RuboCop rubocop:disable, TS ts-expect-error)
- Plan file Phase 3
