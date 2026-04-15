# KPIs — flux.ai

Updated: 2026-04-16 (cycle 0 — bootstrap)

Measured values are **absent** until Phase 8 telemetry lands. Until then,
these are the metrics we *want* to drive, documented so they're not
forgotten.

## Activation (top priority)

### A1 — users who open the exported KiCad file
- **Why:** If users never open the zip, nothing downstream matters.
- **Target:** ≥ 60% of exports opened.
- **Current:** unknown (no telemetry).
- **Signal:** `export.opened` event fired by a helper script inside the zip, OR a UTM-tracked link to an "Opening your first KiCad project" doc.

### A2 — users who make their first edit in flux.ai after an export
- **Why:** Indicates the tool became a living workspace, not a one-shot generator.
- **Target:** ≥ 30% within 7 days.
- **Current:** unknown.

## Product quality

### Q1 — validation-issue dismissal ratio
- **Why:** High dismissal rate = our rules are noise. Low rate = rules are correctly calibrated.
- **Target:** 10–30% (too low = rules too timid, too high = rules are noise).
- **Current:** feature not shipped yet (Phase 3).

### Q2 — improve-design click-through
- **Why:** Clicking Improve Design repeatedly = real engagement. Never clicking = feature is invisible.
- **Target:** avg ≥ 2 clicks per project.
- **Current:** unknown.

### Q3 — revision count per project at export
- **Why:** Iteration is the whole point. Single-revision exports are one-shot gambles.
- **Target:** median ≥ 3.
- **Current:** unknown.

## Trust

### T1 — generate-to-export time
- **Why:** If users spend <5 min before exporting, they're not trusting the output.
- **Target:** median ≥ 10 min of workspace time before first export.
- **Current:** unknown.

### T2 — KiCad-open success rate
- **Why:** Exports that fail to load in KiCad destroy trust instantly.
- **Target:** 100% of exports open in KiCad 8 without errors.
- **Current:** not tested against real KiCad installations; unit tests verify the file shape only.

## Ops

### O1 — test suite duration
- **Why:** Fast feedback → fast iteration.
- **Target:** full suite (unit + build + E2E) < 60s.
- **Current:** ~17s unit + build + 15s E2E = ~32s. Healthy.

### O2 — cost per cycle (Anthropic API)
- **Why:** Continuous agent loop has a token bill. Budget must be enforced.
- **Target:** < $0.50 per one full agent-org cycle.
- **Current:** unmeasured.

## Business (none yet)

Revenue, conversion, churn — N/A until there's a business model.
