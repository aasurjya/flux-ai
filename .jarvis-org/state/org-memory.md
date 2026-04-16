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

### R9 — KiCad artifact changes need manual open-test in KiCad 8
**Source:** Org Cycle 1 (Phase 1 ship).
**Rule:** "Tests pass" is necessary but not sufficient for any file
that ends up in the generated .zip. The acceptance bar for KiCad
artifact changes is a human opening the file in KiCad 8 and confirming
no red ERC markers. Unit tests confirm the bytes; KiCad confirms the
semantics.

### R10 — Shared helpers between KiCad modules must be exported, not duplicated
**Source:** Org Cycle 1 refactor during Phase 1.
**Rule:** When `schematic-gen` and `netlist-gen` both need to compute
a net name, the helper lives in one file and is exported. Don't
copy-paste — divergence is guaranteed over time.

### R11 — No-op edits must exit early on both client and server
**Source:** Org Cycle 2 (Phase 2 BOM editing).
**Rule:** When an "edit" touches no fields (user clicked Save without
changing anything), both client and server MUST short-circuit before
creating a revision. Empty revisions pollute history and the compare
view. The client detects via `Object.keys(patch).length === 0` and
just closes edit mode. The server records only the fields that
actually differ from `before`.

### R12 — Zod `.strict()` rejects hijack attempts at the schema layer
**Source:** Org Cycle 2. Initially the PATCH body was loose
(`.partial()`) and a malicious payload with `designator: "HIJACKED"`
would have overwritten the stable identity key.
**Rule:** For any patch route where the URL provides a stable identity
key, reject unknown fields at the schema level via `.strict()`. The
URL is the identity source of truth; the body never rewrites it.
Test-case required: payload attempts to change an identity field, row
retains original value.

### R13 — Client-side `<form action>` needs `Promise<void>` signature
**Source:** Org Cycle 3, reenable-validation-form.tsx build error.
**Rule:** React's `<form action={...}>` prop only accepts
`(fd: FormData) => void | Promise<void>`. A server action that returns
`Promise<{ error?: string } | void>` (so the parent can surface errors
in a client UI) will TypeScript-reject when wired directly. Wrap with
`async (fd) => { await action(fd); }` in the client component that owns
the submit UX. Keep the raw server action available when the caller
DOES want the error object (e.g., an inline error paragraph).

### R14 — Carry user state forward across LLM re-runs
**Source:** Org Cycle 3 — implementing dismiss-validation for Phase 3.
**Rule:** Anything the USER manually set on AI-produced output
(dismissals, manual BOM edits in the future, pinned notes) must be
explicitly merged back into the freshly-regenerated output, because
the LLM produces new arrays with new ids each run and the user's state
is otherwise lost. Match strategy: prefer stable id; fall back to
content-shape tuple like `(severity, title)` for items whose id the
LLM regenerates. Test both the id-match path AND the fallback path.

### R15 — SSE/streaming routes still need input validation
**Source:** Org Cycle 4 — `generate-stream` route.
**Rule:** An SSE endpoint returns 200 headers almost immediately and
narrates progress in the body, so there's a temptation to skip the
usual "validate early, 400 on bad input" step. Don't. Path params
flow into `revalidatePath` and store lookups that the SSE body will
invoke; validate the shape (`/^[a-zA-Z0-9_-]+$/`) BEFORE opening the
stream, so traversal-shaped ids are rejected at the HTTP boundary.

### R16 — `revalidatePath` throws without a Next static-generation store
**Source:** Org Cycle 4 — SSE route unit tests.
**Rule:** Calling `revalidatePath` inside a route handler works in a
real Next request, but throws "Invariant: static generation store
missing" in Vitest. For routes where the revalidation is a
nice-to-have (SSE that already drives client-side router.refresh),
wrap in a narrow try/catch so unit tests can exercise the route body
without a full Next request context. Never silently swallow in
production-only code paths.

### R17 — Additive schema fields require an explicit fallback test
**Source:** Org Cycle 5 — Phase 6 structured BOM fields.
**Rule:** When you add an optional `value?` field that the rules
engine prefers over an existing regex check, legacy projects (where
`value` is absent) MUST still pass the regex path. Add a test that
explicitly constructs a BOM without `value` and asserts the rule
behaves the same as before. Skipping this test = silent regression
for every customer who hasn't re-run generation since the migration.

### R18 — `null` vs `undefined` in PATCH bodies is a semantic distinction
**Source:** Org Cycle 5 — BOM value editing.
**Rule:** `undefined` (omitted key) means "no change". `null` means
"clear this field". Express the distinction at the schema layer with
`z.union([z.string(), z.null()]).optional()`. In the store, handle
the three cases explicitly: omitted → keep, null → delete, string →
set. Don't collapse them or the user can't clear a field without
breaking back-compat on nullable clients.

### R19 — Silent-skip on identity collision hides real signal
**Source:** Org Cycle 6 — improve-design replacement support.
**Rule:** If two writes claim the same stable identity key
(designator, primary key, slug), the correct responses are: merge /
replace, reject with a 400 error, or route to disambiguation. Never
default to "drop the second one quietly" — from the user's
perspective this becomes "nothing happens when I click the button",
the worst possible failure mode. If unsure, prefer replace + record
exactly what changed; the user can always undo from the revision
history.

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
