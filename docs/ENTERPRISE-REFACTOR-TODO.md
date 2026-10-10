# Job Task enterprise refactor TODO

Owner-directed execution checklist. Complete one bounded change at a time; preserve UI, behavior, API, DB and authentication contracts. Do not push, deploy, run migrations or touch production without separate approval.

- [x] Verify Git, AGENTS.md, project architecture and baseline.
- [x] Extract LiveTask presentation from LiveBoard without changing row markup. `npm run check` passed; local commit `4e48502`.
- [x] Refactor Dashboard and Job Task components in reviewed, behavior-preserving increments (DashboardJobRow, JobDisplay and Job action visibility).
- [x] Separate frontend state management and business logic without changing contracts (query, sync policy and UI action visibility; React effects remain in hooks).
- [x] Review backend/API structure and refactor only safe approved internal modules (existing feature modules are already bounded; avoid auth/API/SQL changes).
- [x] Audit authentication, roles and permissions (source and local integration tests read-only; no policy change).
- [x] Strengthen unit, integration and browser regression coverage (new query, sync and visibility tests; role/auth/atomicity/browser regressions pass).
- [x] Run final TypeScript, build, schema, regression and security checks (`npm run check` exit 0 after 2026-10-10 commits).
- [x] Review diffs and commit each accepted change to local main (`673c434`, `c69fc8e`; independent Gemini read-only review).
- [x] Confirm clean Git and no orphaned worktrees/logs; document evidence and limitations (single main worktree, clean status; no deploy, push or production testing).

## Operating rules

ChatGPT is Architect/PM/reviewer; Ex-MCP executes. Up to two bounded read-only AGY workers where useful. For each TODO: inspect actual files, constrain scope, implement, validate, review diff, commit locally, update this checklist and Goal checkpoint. A failed check is a blocker to resolve, not permission to skip. The existing hourly continuation task is the only scheduler.
