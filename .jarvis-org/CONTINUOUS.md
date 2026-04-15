# Continuous mode — JARVIS Org loop

## Start the loop

From inside Claude Code:

```
/loop 1h /jarvis-cycle
```

Every hour, Claude Code invokes `/jarvis-cycle`, which runs one full
organizational loop (CEO → Dev → QA → review → docs → CEO close) and
commits the result.

For faster iteration during active work, shorter intervals:
```
/loop 15m /jarvis-cycle
```

## How it stops itself

Four independent guards — any one halts the loop:

1. **Budget ceiling** (`JARVIS_BUDGET.json`)
   - `maxCostUSD` per session (default 50)
   - `maxWallClockHours` per session (default 12)
   - Checked before each cycle starts
2. **Stop-gate hook** (`.claude/hooks/jarvis-stop-gate.js`)
   - Refuses session end unless tests + build + e2e green
   - Gated by `JARVIS_BUDGET.json.enableStopGate` (default false;
     flip to true when confident in the gate)
3. **Escalation blocker** (`JARVIS_BLOCKED.md`)
   - Any agent that can't make progress writes this file
   - Stop-gate refuses to end while file present
   - Loop reads it at each cycle start; halts if present
4. **User interrupt**
   - Ctrl+C at any time
   - Or write `STOP` to `.jarvis-org/inbox/user.md` (cycle reads
     this file at start)

## Monitoring

Watch the cycle output in real-time:

```
tail -f .jarvis-org/state/current-cycle.md
tail -f .jarvis-org/state/decisions.md
tail -f JARVIS_LOG.md
git log --oneline
```

## Override a cycle

If you want to feed the org a specific direction:

1. Write to `.jarvis-org/inbox/ceo-founder.md` — next cycle's CEO
   step will read this and factor it in.
2. Or write to `.jarvis-org/inbox/head-of-product.md` — will feed
   directly into the next backlog refresh.
3. Or edit `.jarvis-org/state/decisions.md` — the CEO reads past
   decisions; new entries are respected.

Messages from the user appear in `.jarvis-org/inbox/` with a
`## From user — <date>` header. Agents prioritize these.

## How one cycle behaves

Approximate token + time per cycle (rough):

- CEO step: ~3k tokens, ~5s
- Head-of-product: ~5k tokens, ~10s
- CTO + Challenger (parallel): ~10k tokens, ~30s
- Planner: ~3k tokens, ~5s
- Dev (TDD): ~15-30k tokens, ~90s
- Parallel review gate (3 agents): ~15k tokens, ~45s
- QA (runs npm test + build + playwright): ~5k tokens + real time ~30s
- Writer: ~5k tokens, ~10s
- CEO closing: ~3k tokens, ~5s

Per cycle: ~65-90k tokens, ~3-5 minutes wall clock.

At Claude Opus pricing (~$15/M input + $75/M output), one cycle is
roughly $0.15-0.30. 24 cycles (one day on /loop 1h) ≈ $4-7.

## What ships per cycle

One atomic commit — reverting is `git revert <sha>`. The commit
message follows the convention:

```
feat(phaseN): <phase summary> — org cycle N
```

## Safety checklist before enabling continuous mode

- [ ] `JARVIS_BUDGET.json` reviewed — cost + time ceilings sensible
- [ ] `git status` clean (no uncommitted changes that could get lost)
- [ ] Tests + build green (`npm test && npm run build && npx playwright test`)
- [ ] You understand which agents the loop will run and have read
      their role definitions
- [ ] You have a way to interrupt (terminal open, or a timer)

## When to turn it off

- You're making breaking changes by hand — the loop may collide
- You're unsure what a pending cycle will do
- Cost budget approaching
- `JARVIS_BLOCKED.md` exists (fix the block first)
- A review round just flagged a CRITICAL that was auto-fixed but
  the fix feels suspicious
