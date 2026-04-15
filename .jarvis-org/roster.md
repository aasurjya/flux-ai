# Roster

| Role | Agent | Owns | Reads |
|---|---|---|---|
| Founder / CEO | `ceo-founder` | `state/decisions.md` | all state + git log + inbox/ceo-founder |
| Head of Product | `head-of-product` | `state/backlog.md` | decisions, KPIs, telemetry, inbox |
| CTO | `architect` | ADRs in `docs/adrs/` | backlog, code, current commit |
| Engineering PM | `planner` | sprint plans | top backlog story |
| Principal / Devil's Advocate | `socratic-challenger` | N/A (only asks questions) | whatever it's pointed at |
| Product Strategist | `product-intel` | periodic strategic reviews | features + customer signal |
| Senior Dev | `tdd-guide` | code + tests | top sprint task |
| Code Reviewer | `code-reviewer` | inline review findings | latest diff |
| Security | `security-reviewer` | security findings | new routes, data paths, deps |
| Legal & Compliance | `legal-compliance` | risk flags | data flows, licenses, external calls |
| QA | `e2e-runner` | E2E reports | full test suite + screenshots |
| DevOps | `build-error-resolver` | build fixes | failing builds |
| Tech Lead (maintenance) | `refactor-cleaner` | cleanup PRs | dead code, files >400 lines |
| Writer | `doc-updater` | docs | code reality vs doc claims |

Communication: every agent writes messages to `.jarvis-org/inbox/{other-role}.md` and logs its own output in `.jarvis-org/outbox/{self}.md`.

The user is an implicit 15th role — read `.jarvis-org/inbox/user.md` for anything a human needs to answer.
