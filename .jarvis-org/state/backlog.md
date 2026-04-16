# Backlog — flux.ai

Owned by: `head-of-product`.
Updated: 2026-04-16 (cycle 0).

The canonical engineering phase plan is at
`~/.claude/plans/twinkling-swinging-kitten.md`. This backlog is the
**head-of-product's refinement** of that plan against real customer
signal. When signal is absent, it mirrors the phase plan.

## Next (committed this cycle)

### 1. Streaming generation progress (Phase 4 of the plan)
**Score:** 8/10
**Evidence:** The 5-stage AI pipeline takes ~30s with one generic
spinner. Users can't tell working from stuck. Classic abandonment
pattern. Standard SSE/streaming is table stakes in modern LLM UIs
(ChatGPT, Claude, Cursor).
**Owner:** tdd-guide (dev) + architect (review)
**Story:** see below.

## Up next (ordered, not committed this cycle)

2. **Rules read structured fields** (Phase 6) — evidence: regex-on-prose fragility unmeasured
3. **Improve-design replacement support** (Phase 7) — evidence: silent-skip bug on same-designator additions
4. **Telemetry + `/admin/stats`** (Phase 8) — evidence: we're flying blind on all KPIs

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
- **Cycle 3 — Phase 3 dismiss validation issues** ✅ (this cycle)

## Stories

### 1. Streaming generation progress via SSE

**As a** hardware engineer clicking "Generate design"
**I want** to see each pipeline stage narrate as it runs
**So that** I know whether it's working, stuck, or failed — not a blank 30s wait.

**Acceptance criteria:**
- [ ] New SSE route `app/api/projects/[id]/generate-stream/route.ts` emits `{ stage, status: "running"|"completed"|"error", result? }` events per pipeline stage
- [ ] Refactor `lib/ai/pipeline.ts` to accept optional `onStage?: (name, result) => void`. Sync entry point unchanged so tests still pass
- [ ] Client component consumes SSE, drives `AiWorkflowStages` with per-stage status
- [ ] Graceful fallback: if SSE fails on some client (corp proxy, etc.), fall through to current non-streaming generate route
- [ ] Tests: mock AiClient with delays, assert status transitions (running → completed for each stage). E2E: first stage visible within 2s of clicking Generate.
- [ ] Coverage thresholds hold.

**Out of scope:**
- Progress bar percentage (stage-list is cleaner semantically)
- Cancellation mid-stream (Phase 4 follow-up if user signal demands it)

**Evidence / references:**
- product-intel Session 2 improvement-plan, finding #3
- Standard LLM-UI pattern (ChatGPT, Claude, Cursor all stream)
- Plan file Phase 4
