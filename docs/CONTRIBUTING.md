# Contributing to Job Task

Thanks for helping improve a practical production-operations app.

1. Open an issue or describe the change before large work.
2. Keep each pull request **focused on one problem**. Do not refactor working login, API, database, or adjacent features while addressing unrelated UI issues.
3. Preserve role checks, line-scoped permissions, atomic task transitions and `America/Toronto` production dates.
4. Run `npm run check` (typecheck, build, schema, unit and browser regression tests) before submission.
5. Add a regression test for behavior changes, and describe how you verified the result.
6. Never upload real usernames, employee information, Cloudflare IDs, D1 backups, generated bootstrap SQL, tokens, passwords, screenshots showing production records, or `.env` files.

## Pull request checklist

- [ ] The diff includes only files required for the stated change
- [ ] TypeScript and build checks pass
- [ ] Relevant tests pass, or limitations are clearly explained
- [ ] No operational secrets or sensitive data
- [ ] No production deployment or database migration without separate approval

**Licensing:** Job Task is distributed under the MIT License. See the repository's `LICENSE` file; retain the existing copyright and license notice when redistributing the software.
