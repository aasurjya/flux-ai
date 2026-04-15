---
description: Continuous coding and improvement loop for the Flux.ai MVP
---
Use this workflow when the goal is to keep shipping the next best improvement to the Flux.ai web app with safe validation after each change.

1. Re-read `plan.md` and the current product state before making new changes.
   - Prioritize the highest-impact unfinished item.
   - Prefer end-to-end improvements over isolated refactors.
   - Keep the current product direction aligned with prompt-to-schematic generation, explainable revisions, and future KiCad export.

2. Map the relevant code path before editing.
   - Identify the route, component, data store, and types involved.
   - Find the authoritative logic first.
   - Check whether changes affect landing, dashboard, project creation, workspace, revision flow, or export readiness.

3. Implement one focused improvement at a time.
   - Make the smallest complete change that moves the product forward.
   - Prefer working features over placeholders when the scope is clear.
   - Keep imports at the top of files.
   - Avoid unrelated edits.

4. Preserve the product safety rules during every iteration.
   - Never make silent automatic design changes.
   - Every improvement must create a revision instead of overwriting history.
   - Every revision must explain what changed and why.
   - Validation warnings must stay visible until the user resolves or accepts them.

5. Validate after every meaningful implementation step.
// turbo
   - Run `npm run build`
   - If the build fails, fix the root cause before doing more feature work.
   - If the build passes, continue to the next highest-value task.

6. After each successful change, update project state.
   - Update the todo list or plan when a milestone is completed.
   - Save durable architectural context when a new pattern or subsystem is introduced.
   - Keep summaries concise and action-oriented.

7. Repeat the loop until one of these stopping conditions is reached.
   - The requested milestone is complete.
   - A blocker requires user input.
   - A risky product or architectural decision needs confirmation.
   - Further changes would be speculative without backend, AI, or KiCad details.

8. End each pass with a short handoff.
   - What changed.
   - What was validated.
   - What the best next improvement is.

Recommended next priorities for this repository:
- Add revision creation from the `Improve design` action.
- Introduce structured AI workflow stages for requirements, architecture, BOM, and validations.
- Add better form UX, error handling, and empty states.
- Prepare export job scaffolding for future KiCad integration.
