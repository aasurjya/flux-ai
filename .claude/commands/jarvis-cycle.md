---
description: Run one full JARVIS org cycle — CEO → PM → CTO → Challenger → Dev → QA → Security → Legal → Writer → CEO closing review
---

# JARVIS Org — Full Cycle Run

Run one complete pass through the flux.ai virtual organization. Each
agent does its role, writes to `.jarvis-org/inbox/{other}.md` for
hand-offs, and logs output to `.jarvis-org/outbox/{self}.md`.

## Pre-flight

Before invoking any agent, read these to get context:
1. `.jarvis-org/state/current-cycle.md` — find the cycle number; increment it
2. `.jarvis-org/state/decisions.md` — last CEO decision
3. `.jarvis-org/state/backlog.md` — current top story
4. `.jarvis-org/state/KPIs.md` — what we're measuring
5. `git log --oneline -10` — what just shipped

Check `JARVIS_BUDGET.json` `enableStopGate` + `maxCostUSD`. If cost cap
reached, append a handoff note to `.jarvis-org/state/current-cycle.md`
and STOP cycle.

## The cycle (invoke each agent in order)

### Step 1 — CEO reviews + decides
Invoke `ceo-founder` with a prompt that hands it the pre-flight context.
Expect: appended entry in `.jarvis-org/state/decisions.md` with
ship-next / kill / question / prev-cycle-review.

### Step 2 — Head of Product refreshes backlog
Invoke `head-of-product` with the new CEO decision.
Expect: updated `.jarvis-org/state/backlog.md`, top story written to
`.jarvis-org/inbox/planner.md`, status note to `ceo-founder` inbox.

### Step 3 — CTO (architect) reviews top story
Invoke `architect` pointed at the top backlog story. If the story needs
architecture changes, expect an ADR in `docs/adrs/{YYYYMMDD}-{slug}.md`.

### Step 4 — Socratic Challenger stress-tests
Invoke `socratic-challenger` with the CTO's ADR (or story if no ADR).
Max 10 questions. CEO decides in the next cycle which questions to
engage with.

### Step 5 — Planner breaks story into tasks
Invoke `planner` with the top story + CTO ADR + challenger questions.
Expect: an ordered task list written to
`.jarvis-org/inbox/tdd-guide.md`.

### Step 6 — Developer implements top task with TDD
Invoke `tdd-guide` with the first task. Expect: failing test → minimal
implementation → passing test → refactor. DO NOT batch multiple tasks.

### Step 7 — Parallel review gate
Invoke in ONE message: `code-reviewer`, `security-reviewer`,
`legal-compliance` — each reads the latest diff.
- `code-reviewer`: bugs, edge cases
- `security-reviewer`: CRITICAL/HIGH findings
- `legal-compliance`: only runs if data-handling / new dep / external
  call is in the diff — otherwise returns "no findings, nothing in this
  diff touches compliance surface"

Fix any CRITICAL or HIGH before proceeding. Max 2 review-fix cycles.

### Step 8 — QA runs full suite
Invoke `e2e-runner`. Expect: `npm test`, `npm run build`,
`npx playwright test` all green. If any fails, loop back to step 6.

### Step 9 — Writer syncs docs
Invoke `doc-updater` with the diff + what shipped. Expect: updated
`plan.md`, `JARVIS_LOG.md`, and any affected JSDoc / README sections.

### Step 10 — CEO closes the cycle
Invoke `ceo-founder` a second time with the complete cycle transcript.
Expect: appended "Cycle N review" in `decisions.md`:
- Did it ship?
- Did it move a KPI (or: the KPI can't be measured yet, flag it)?
- What changed in the org-memory?

Append cycle log to `.jarvis-org/state/current-cycle.md`.

### Step 11 — git commit
Create ONE commit at the end of the cycle with all files from this
cycle (code + org state). Use conventional-commit format:
`feat(phaseN): short description — org cycle N`.

## Rules

- **One cycle = one commit.** The diff is the auditable record.
- **If any agent refuses with a "need more info" response, write the
  question to `.jarvis-org/inbox/user.md` and STOP the cycle** — don't
  guess user intent.
- **Budget:** `JARVIS_BUDGET.json` caps cost. If a cycle blows past
  `maxCostUSD / estimated cycles per week`, stop and log.
- **Checkpoints:** every 3 cycles, `doc-updater` produces a summary
  report for the user (cycles 3, 6, 9, …).

## If a cycle breaks

- Tests red at step 8 → `build-error-resolver` or `tdd-guide` fixes, loop
- Step 7 finds CRITICAL → loop back to step 6, max 2 attempts, else
  stash + log to `JARVIS_BLOCKED.md`
- Step 4 asks a question only the user can answer → write to
  `.jarvis-org/inbox/user.md`, STOP, wait for next session with user
  input

## Continuous mode

```
/loop 1h /jarvis-cycle
```

Runs every hour. Budget guardrails in `JARVIS_BUDGET.json` stop the
loop when the cost ceiling is reached. Kill anytime with Ctrl+C or
by writing `STOP` to `.jarvis-org/inbox/user.md` (future check).
