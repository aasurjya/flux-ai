# Org memory — flux.ai

Cross-cycle learnings. What we tried, what worked, what didn't, so future
cycles don't repeat the same mistakes or re-discover the same rules.

## Durable rules (learned the hard way)

### R1 — Schema additions must be optional (back-compat)
**Source:** Session 2 revision-compare feature.
**Rule:** When extending `ProjectSummarySchema`, all new fields are
optional. Old JSON files must still pass validation. Migration happens
lazily on next write, not eagerly at boot.

### R2 — KiCad S-expression emit must pass real KiCad open
**Source:** Cycle 1 (scheduled). Manual verification required before
declaring done.
**Rule:** "Tests pass" is not sufficient for KiCad artifact changes.
The acceptance bar is "opens in KiCad 8 with no red markers".

### R3 — LLM output must route through Zod before mutation
**Source:** Session 1 AI pipeline. A hallucinated response that fails
validation must trigger retry-once, not silently break the downstream
mutation.
**Rule:** Every `callStructured` output is validated at the boundary;
implementers never trust raw tool_use JSON.

### R4 — Every mutating route holds the store lock
**Source:** Session 2 data-integrity round.
**Rule:** Anything that reads-modifies-writes projects.json must be
wrapped in `withStoreLock`. No exceptions. (Phase 5 will replace with
SQLite transactions.)

### R5 — Filenames are slugified; in-file titles keep user casing
**Source:** Session 2, from the "spaces in filenames" bug.
**Rule:** Use `filenameSlug(projectName)` for ANY filesystem / URL /
Content-Disposition output. Retain raw `projectName` only in
human-facing title fields.

### R6 — User-controlled strings that flow into generated code need sanitization at two layers
**Source:** Security review of firmware scaffold.
**Rule:** Schema rejects control chars at input (first layer). Generator
strips newlines / comment terminators at output (second layer). Defence
in depth.

### R7 — Tests that depend on LLM output stability use the stub client
**Source:** Session 1.
**Rule:** Unit + integration tests inject `createStubAiClient()`. Only
an explicit `USE_REAL_AI=true` integration test exercises the real API —
and is gated behind budget guardrails.

### R8 — Hydration mismatches from time-formatting need suppressHydrationWarning
**Source:** Session 2 revision-compare.
**Rule:** Relative timestamps (formatRelative) can differ across
server/client render window. Always suppress hydration warning at the
text node.

## Failed experiments (do not repeat)

### F1 — Mock-project deletion
**Tried:** Let user delete seeded ESP32 example project.
**Outcome:** Cycles re-seeded it; users confused. Now blocked at server
action layer.
**Keep:** mock projects are read-only.

### F2 — "Improve design" as cosmetic stub
**Tried:** Button appended a canned revision string.
**Outcome:** Users clicked, nothing useful happened, trust damaged.
Replaced with real AI-driven BOM editing in Session 2.
**Keep:** never ship a button whose action doesn't match its label.

## Open hypotheses (testable, untested)

### H1 — Indie engineers open the BOM CSV before the KiCad schematic
**Test:** Phase 8 telemetry — compare `export.downloaded` vs (eventual)
`bom.csv.opened` vs `kicad.schematic.opened`.
**If true:** Optimise BOM CSV first, schematic second. Contrarian-take
becomes the plan.

### H2 — Clarifying-questions is more annoying than helpful
**Test:** Phase 8 telemetry — fraction of paused generations that get
resumed, vs fraction abandoned.
**If true:** Make clarifying questions opt-in, or let the AI default
to best-guess and surface the guesses for override.

### H3 — Improve-design is ignored after first try
**Test:** Distribution of `improve.clicked` per project. If most projects
have 0-1, the button is invisible or useless.
**If true:** Either make the prompt to improve more obvious, or bake
improvements into a post-generation auto-step.
