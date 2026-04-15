# JARVIS Org — flux.ai's Virtual Team

This directory is the **shared state** of an autonomous agent organization
building flux.ai. Each agent plays a role (CEO, CTO, PM, Dev, QA,
Security, Legal, Writer, …) and reads / writes markdown files here.

## Directory layout

```
.jarvis-org/
├── README.md              ← you are here
├── roster.md              ← who does what
├── inbox/                 ← messages queued per agent
│   ├── ceo-founder.md
│   ├── head-of-product.md
│   ├── architect.md       (a.k.a. CTO)
│   ├── planner.md         (a.k.a. Engineering PM)
│   ├── tdd-guide.md       (a.k.a. Senior Dev)
│   ├── code-reviewer.md
│   ├── security-reviewer.md
│   ├── legal-compliance.md
│   ├── e2e-runner.md      (a.k.a. QA)
│   ├── doc-updater.md
│   ├── socratic-challenger.md
│   ├── product-intel.md
│   ├── refactor-cleaner.md
│   └── build-error-resolver.md
├── outbox/                ← append-only log of what each agent said
│   └── {agent}.md
└── state/
    ├── decisions.md       ← CEO + CTO decisions (append-only)
    ├── backlog.md         ← head-of-product owns; ordered + ruthless
    ├── KPIs.md            ← what we measure
    ├── current-cycle.md   ← which cycle N we're in + current focus
    └── org-memory.md      ← cross-cycle learnings
```

## Running one cycle

A cycle is one pass through the organization:
1. **CEO** reads state, decides next ship + next kill, writes to decisions.md
2. **Head of Product** refreshes backlog, writes top story to planner
3. **CTO (architect)** reviews story for technical soundness, flags unknowns
4. **Socratic Challenger** asks 3 hard questions about the plan
5. **Planner** breaks story into ordered tasks
6. **Developer (tdd-guide)** implements top task with tests
7. **QA (e2e-runner)** runs full suite + visual audit
8. **Code-reviewer + Security + Legal** review in parallel
9. **Writer (doc-updater)** syncs README / plan.md / JARVIS_LOG.md
10. **CEO** reviews cycle outcome, writes closing note

Invoke via `/jarvis-cycle` (see `.claude/commands/jarvis-cycle.md`).

## Running continuously

```
/loop 1h /jarvis-cycle
```

Budget + safety:
- `JARVIS_BUDGET.json` (in repo root) caps cost + wall-clock
- `.claude/hooks/jarvis-stop-gate.js` blocks session end unless tests green
- Each cycle commits separately — easy to revert
- `JARVIS_BLOCKED.md` written on escalation — loop halts until human clears

## Ground rules

- Every agent output is **markdown with clear structure**. No raw text blobs.
- **Cite files** — every claim references a path.
- **Kill is a first-class action** — every cycle kills at least one item.
- **Evidence > opinion** — "telemetry says X" beats "I think Y".
- **The user is always an agent too** — write to `inbox/user.md` when human input is needed.
