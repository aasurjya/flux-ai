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

## Phase 3: Backend and Data Models
- Add project, revision, BOM item, validation issue, and export job models
- Add server actions or API routes for project creation and revision generation
- Add persistence with a database after the mock flow is validated

## Phase 4: AI Workflow
- Parse prompts into structured requirements
- Ask clarifying questions when required
- Build a circuit graph draft from templates and known patterns
- Generate BOM suggestions
- Run validation passes
- Create safe revision-based improvements with explainable diffs

## Phase 5: KiCad Integration
- Add export job management
- Generate KiCad-compatible output bundles
- Run KiCad CLI checks where available
- Add plugin integration points later

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
