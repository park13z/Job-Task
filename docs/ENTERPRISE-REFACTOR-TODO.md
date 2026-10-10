# Job Task enterprise refactor TODO

Owner-directed execution checklist. Complete one bounded change at a time; preserve UI, behavior, API, DB and authentication contracts. Do not push, deploy, run migrations or touch production without separate approval.

- [x] Verify Git, AGENTS.md, project architecture and baseline.
- [x] Extract LiveTask presentation from LiveBoard without changing row markup. `npm run check` passed; local commit `4e48502`.
- [ ] Refactor Dashboard and Job Task components in reviewed, behavior-preserving increments.
- [ ] Separate frontend state management and business logic without changing contracts.
- [ ] Review backend/API structure and refactor only safe approved internal modules.
- [ ] Audit authentication, roles and permissions (read-only unless separately approved).
- [ ] Strengthen unit, integration and browser regression coverage.
- [ ] Run final TypeScript, build, schema, regression and security checks.
- [ ] Review diffs and commit each accepted change to local main.
- [ ] Confirm clean Git and no orphaned worktrees/logs; document evidence and limitations.

## Operating rules

ChatGPT is Architect/PM/reviewer; Ex-MCP executes. Up to two bounded read-only AGY workers where useful. For each TODO: inspect actual files, constrain scope, implement, validate, review diff, commit locally, update this checklist and Goal checkpoint. A failed check is a blocker to resolve, not permission to skip. The existing hourly continuation task is the only scheduler.
