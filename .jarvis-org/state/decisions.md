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
