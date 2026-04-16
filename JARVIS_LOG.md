# JARVIS Autonomous Run Log

> Append-only record of what the autonomous loop did in each session.
> Newest session at the top.

---

## Session 3 — 2026-04-16 (JARVIS Org bootstrap + Cycle 1)

**Shift in operating model.** User pivoted the product toward a
**self-improving agent organization**: roles (CEO, CTO, PM, Dev, QA,
Security, Legal, Writer, …) that read / write shared markdown state
and loop continuously. flux.ai remains the product; the org is the
system building it.

### Bootstrap
- 3 new role agents: `ceo-founder`, `legal-compliance`, `head-of-product`
  (added to `~/.claude/agents/`). Plus `socratic-challenger` and
  `product-intel` from earlier in the session — now 14 non-blender
  agents total = full virtual company.
- `.jarvis-org/` state directory inside flux.ai:
  `inbox/`, `outbox/`, and `state/` with README, roster, decisions,
  backlog, KPIs, current-cycle, org-memory files seeded.
- `/jarvis-cycle` slash command at `.claude/commands/jarvis-cycle.md`
  — one user invocation runs the full org loop
  (CEO → PM → CTO → Challenger → Dev → QA → Security → Writer → CEO).
- `/loop 1h /jarvis-cycle` unlocks continuous mode; budget
  guardrails in `JARVIS_BUDGET.json` cap cost/time.

### Cycle 1 — Phase 1 shipped
**Scope:** KiCad schematic wires itself via global labels + stdlib
power symbols. Biggest user-visible credibility leak fixed.

Changes:
- `lib/kicad/netlist-gen.ts` — exported `netNameFor`, `uniqueEdges`,
  `buildBlockRefMap` (R10 rule: shared helpers live in one file).
- `lib/kicad/schematic-gen.ts` — added `globalLabelNode`,
  `powerSymbolNode`, `powerLibIdFor`. For each unique architecture
  edge, emit two `(global_label "VCC_3V3" …)` nodes — one at each
  endpoint's placed-symbol position. KiCad's ERC wires same-named
  labels into one net. For power-kind blocks, emit `power:+3V3` /
  `power:+5V` / `power:VBUS` stdlib symbols nearby.
- 5 new unit tests covering: label-per-edge, +3V3 for VCC_3V3,
  +5V for VCC_5V, VBUS for USB-input power, no-power no-symbol,
  no-edge no-label.

### Gates (all green)
- 198 / 198 unit tests (was 193)
- 36 / 36 E2E
- Build exit 0
- Coverage thresholds hold

### Durable rules added to org-memory
- **R9** — KiCad artifact changes need manual open-test. Unit tests
  confirm bytes; KiCad confirms semantics.
- **R10** — Shared helpers between KiCad modules must be exported,
  not duplicated.

### Remaining backlog (head-of-product owned)
Cycle 2 — Phase 2 (inline BOM editing). Same cycle structure.
Phases 3-8 queued per the approved plan.

### Cycle 2 — Phase 2 shipped (same day)

**Scope:** Inline BOM editing with revision trail. Users can edit
name / quantity / package / status of any BOM row in-place without
round-tripping through the AI. Every edit creates a revision with a
human-readable diff (`status: needs_review → selected`).

Changes:
- `app/api/projects/[id]/bom/[designator]/route.ts` — new PATCH
  route. Zod `.strict()` partial schema rejects unknown fields at
  the schema layer (R12 rule: URL is the identity source of truth,
  body can't rewrite it).
- `lib/project-store.ts` — `patchBomItem()` with `withStoreLock`,
  builds human-readable change list, creates revision + snapshot.
- `app/projects/[id]/bom-editor-row.tsx` — new client component.
  Pencil → inline edit → Enter/Save / Escape/Cancel. No-op saves
  exit early (R11 rule). Keyboard-accessible end to end.
- `e2e/bom-edit.spec.ts` — 2 tests (happy-path creates revision;
  Cancel discards).

Gates: 204 unit + 38 E2E green. Build exit 0. Coverage thresholds
hold.

Durable rules added:
- **R11** — No-op edits must exit early on both client and server.
- **R12** — Zod `.strict()` rejects hijack attempts at the schema
  layer (URL is the identity key; body can't rewrite it).

Next: Cycle 3 — Phase 3 (dismiss validations).

---

## Session 2 — 2026-04-15 (continuous improvement)

**Goal:** Continuous improvement loop following Session 1 hand-off.
Multi-agent deep review (code-reviewer, refactor-cleaner, security-reviewer,
e2e-runner, doc-updater) drove the backlog.

### Rounds + commits

**R0 — direct audit** (`e61a1c4`, `e95f6c7`)
End-to-end dry run + unzip + inspect → 5 substance issues: netlist pin
semantics wrong, float precision noise, filename spaces, no mobile
responsive coverage, exports accumulated forever. All fixed.

**R1 — data integrity** (`e7cc1d9`) — 2 CRITICAL + 3 HIGH
Atomic writes (tmp + rename), promise-chain mutex on all mutations,
Zod schema validation on read with compile-time type tripwire,
crypto.randomUUID for all IDs, sanitize error messages, path-containment
in getExportFilePath, ISO timestamps instead of "Updated just now" literal.

**R2 — security hardening** (`de25dae`) — 1 HIGH + 3 MEDIUM
Strip ASCII control chars in sexp escape, independent Content-Disposition
filename re-sanitise, fixed-string (ReDoS-safe) label matching in
netNameFor, log design-rule exceptions instead of swallowing.

**R3 — AI + cleanup** (`7db5c2d`)
Real AI "Improve design" (replaces cosmetic stub) — reads state,
proposes targeted BOM edits, re-runs design rules, records rationale.
Schema-retry in AI client (dev.to/2026 guidance). JLCPCB
manufacturability preference in BOM prompt. Long-name break-words.
Pending-labels on action buttons. Dead code removed (38 lines).

**R4 — UX features** (`9b13beb`)
Delete project with native-confirm dialog + mock-project protection.
Retry failed export job. Relative-time formatter. State-aware
"architecture blocks" description that matches actual state.

### Gates passed

- 142 unit + integration tests (was 90 after Session 1)
- 29+ E2E tests (was 15)
- Coverage: 94%+ on app/api + lib
- Build: `next build` clean
- Zero CRITICAL or HIGH findings outstanding

### Remaining watch items

- No README.md (low priority for MVP)
- Live Anthropic API calls still only tested manually with USE_REAL_AI=true
- E2E for improve-design round-trip assertion (not just button visibility)
- projects list empty-state has no dedicated E2E
- Tier 3 performance pass not started (Lighthouse, bundle analysis)
- SQLite persistence migration deferred until JSON hits its limit

---

## Session 1 — 2026-04-15

**Goal:** Build Phases 4 + 5 of flux.ai end-to-end with TDD, brainy E2E
testing, real Anthropic SDK integration, and real KiCad export. Then
enter continuous improvement.

### Commits (16 atomic)

```
2874842 test(coverage): substance gains — runExportJob + stub-client
5d240ab feat(e2e): 'brainy' UX-logic Playwright suite + bugfix
485e050 feat(kicad): Phase 5.5 — KiCad bundle download endpoint
175ebe8 feat(kicad): Phase 5.4 — real export bundle + runExportJob
cbe0f07 feat(kicad): Phase 5.3 — netlist XML + BOM CSV
b7e8655 feat(kicad): Phase 5.2 — symbol + schematic generation
a100a9d feat(kicad): Phase 5.1 — S-expression AST + serializer
875b490 feat(ai): Phase 4.6 — wire AI pipeline into generateProject
0796323 feat(ai): Phase 4.5 — BOM suggestion from architecture
7ccd352 feat(ai): Phase 4.4 — architecture / circuit-graph generation
2b17734 feat(ai): Phase 4.3 — clarifying-question flow logic
0f8407e feat(ai): Phase 4.2 — prompt-to-requirements parser
fa3e726 feat(ai): Phase 4.1 — Anthropic SDK client + prompts
03444fc chore(jarvis): bootstrap autonomous loop
8a95507 chore: initial commit — phases 1-3 complete, 4-5 stubbed
```

### Gates passed

- Unit tests: **90/90 green**
- E2E tests: **15/15 green** (5 spec files)
- Build: `npm run build` exits 0
- Coverage (app/api + lib): **94.03% lines, 88.21% branches, 89.28% funcs**
- Exceeds configured thresholds (80% lines, 75% branches/functions)

### Bugs found by testing

1. `createProjectAction` wrapped `redirect()` in a try/catch, swallowing
   Next.js's `NEXT_REDIRECT` error. Form submissions left the user on
   `/projects/new` with no visible result. Fixed by isolating
   `createProject` in try/catch and letting `redirect()` bubble.

### Architecture decisions

- **Stub AI client by default** (`USE_REAL_AI=false`). Deterministic
  canned responses by schema name. Real Anthropic calls only when
  explicitly enabled. Keeps CI/offline/test flows fast and credit-free.
- **KiCad export scope**: skeleton symbols + schematic + netlist + BOM
  CSV + project file. No pin-level routing (out of MVP scope). User
  refines in KiCad after opening the generated zip.
- **AI page audit** (`USE_AI_AUDIT=true`) opt-in. Default specs rely on
  DOM + keyboard walks + console guards. Audit adds vision-based
  reasoning only when explicitly enabled.
- **Stop-gate hook disabled** (`enableStopGate: false` in
  `JARVIS_BUDGET.json`). The hook is installed but returns 0 until
  flipped, so early sessions can stop cleanly while we're still
  building up confidence in the gates.

### Tier status (continuous improvement ladder)

- **Tier 1 (Correctness)** — partial. Coverage raised 51% → 94% via
  substance tests on untested business logic. `refactor-cleaner`,
  `security-reviewer` sweeps queued for next session.
- **Tier 2 (Experience)** — not started. E2E covers states and
  affordances but a full UX logic pass with `frontend-design` skill
  remains.
- **Tier 3 (Performance)** — not started. Current bundle sizes: 102 kB
  shared, ~115 kB workspace page.
- **Tier 4 (Product depth)** — not started. Will require strategic
  council (planner + architect + frontend-design + CEO personas).

### Tasks for next session

1. Flip `enableStopGate: true` once a full green run is demonstrated
   one more time.
2. Run `refactor-cleaner` full-codebase sweep — start with
   `lib/project-store.ts` (the largest file at ~300 lines).
3. Run `security-reviewer` — review the download endpoint path handling,
   any env-var parsing, Anthropic key handling.
4. Extend AI page audit to send actual screenshots (requires extending
   `AiClient` to support content blocks).
5. Add a visual overview of the circuit graph using
   `outputs.architectureBlocks` — react-flow or a lightweight SVG
   layout. This is the first Tier-4 feature that needs the strategic
   council.

### Files touched

See `git log --stat master` for full detail. Major additions:
- `lib/ai/{client,prompts,parse-requirements,clarify,generate-architecture,suggest-bom,validate,pipeline,stub-client}.ts`
- `lib/kicad/{sexp,symbol-gen,schematic-gen,netlist-gen,bom-csv,bundle,project-file}.ts`
- `app/api/exports/[jobId]/download/route.ts`
- `e2e/lib/{ai-page-audit,test-helpers}.ts`
- `e2e/{landing,create-project,generate-design,export,a11y}.spec.ts`
- `.claude/{settings.json, hooks/jarvis-stop-gate.js}`
- `JARVIS_BUDGET.json`, `JARVIS_LOG.md`
