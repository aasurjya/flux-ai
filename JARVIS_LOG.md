# JARVIS Autonomous Run Log

> Append-only record of what the autonomous loop did in each session.
> Newest session at the top.

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
