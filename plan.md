# flux.ai Build Plan

## Product Direction
- Web app first
- Prompt-to-schematic MVP first
- KiCad export next
- KiCad plugin later
- PCB automation later

## MVP Goal
Build a web app that helps a user describe a hardware idea, turn that into a structured circuit brief, review generated outputs, iterate safely, and prepare the project for KiCad export.

## Phase 1: Foundation
- Scaffold a Next.js app with TypeScript, Tailwind, App Router, and shadcn/ui-style components
- Create a clean landing page and app shell
- Add routes for projects, new project creation, and a project workspace
- Set up shared types, mock data, and reusable UI primitives

## Phase 2: Prompt-to-Schematic Workspace
- Add a project brief form for prompt, constraints, and selected parts
- Show extracted requirements
- Show a generated architecture summary
- Show BOM, validations, and export placeholders
- Add revision history and improvement actions

## Phase 3: Backend and Data Models ✅ DONE
- Project / revision / BOM / validation / export-job models in `types/project.ts`
- Server actions for create, generate, improve, export, delete (`app/projects/...`)
- File-based persistence in `lib/project-store.ts` with atomic writes, mutex,
  Zod schema validation on read. SQLite migration deferred until the JSON
  flow is actually painful at scale.

## Phase 4: AI Workflow ✅ DONE
- Anthropic SDK client with exponential-backoff network retry + schema retry
  (`lib/ai/client.ts`)
- Stub client for offline/dev (`lib/ai/stub-client.ts`)
- Prompt-to-requirements parser (`lib/ai/parse-requirements.ts`)
- Clarifying-question flow with pause/resume in generateProject
- Architecture graph generation with sanitation (dedupe, drop dangling edges)
- LLM-driven BOM suggestion with JLCPCB manufacturability preference
- LLM-driven validator + 7-rule deterministic design-rules engine merged
- AI-driven "Improve design" (`lib/ai/improve-design.ts`) that reads current
  state + validations, proposes targeted BOM edits with rationale, re-runs
  design rules, and records an explanatory revision.

## Phase 5: KiCad Integration ✅ DONE
- S-expression AST + serializer (`lib/kicad/sexp.ts`) with control-char strip
- Symbol library generator — standard-library mapping for passives/connectors,
  local .kicad_sym only for custom ICs
- Full .kicad_sch with title block, lib_symbols, placed symbols on grid,
  sheet_instances
- Netlist XML with semantic net names (VCC_3V3, I2C_BUS, SWD, …) merged by net
- BOM CSV (KiCad-compatible column order)
- .kicad_pro JSON project file
- Archiver-based zip bundle with filename-slug safety
- Next.js download route with jobId allowlist + re-sanitised Content-Disposition
- Bounded disk via GC: keeps latest 3 completed zips per project

## Continuous Improvement (ongoing)
- Tier 1 correctness: coverage 94%, mutex-serialised writes, schema validation
- Tier 2 UX: circuit graph SVG, long-name truncation, mobile responsive,
  delete + retry, relative timestamps, state-aware affordances
- Tier 3 perf: bundle analysis, image optimization — DEFERRED
- Tier 4 depth: real LLM live testing, cost tracking, SQLite — DEFERRED

## Safety Rules
- No silent automatic changes to designs
- Every improvement creates a revision
- Every revision must explain what changed and why
- Validation warnings stay visible to the user

## Immediate Tasks
1. Create the app scaffold and baseline configuration
2. Build the landing page and projects dashboard
3. Build the new project flow and project workspace
4. Add mock data and placeholder improvement flows
5. Prepare the codebase for backend and KiCad integration
