# Job Task

**A line-based production job planner and real-time operations wallboard.**

Job Task is a web app designed for packhouses and production teams. Plan work for the week, start and pause tasks on a production line, record completion, and display today's workload on a full-screen Live Board. The application can be adapted to other team-based workflows.

**Built with:** React, TypeScript, Vite, Tailwind CSS, Hono, Cloudflare Pages/Workers, and Cloudflare D1 (SQLite).

## Features

- **Weekly planning:** Create tasks for a production line and date, with optional descriptions and skid targets. The server assigns weekly sequence numbers across all lines (Monday–Sunday, `America/Toronto`).
- **Execution workflow:** Waiting → In Progress → Paused → In Progress → Done. The server records timestamps; active work time excludes paused intervals.
- **Live wallboard:** Shows only today's Waiting Queue, In Progressing, Paused Today, and Done jobs. Includes full-screen mode, adaptive row density, distinct status colors, and small animated walking workers.
- **Dashboard and history:** Review tasks, dates, statuses, and work time beyond today's Live display.
- **Role and line controls:** Manager, Supervisor, Line Leader, and Assistant access with line membership rules.
- **Reusable job names:** Managers maintain the Job List; planners can select or enter their own task titles.
- **User profile:** Users can update their display name and password.

The Live progress animation means **a task is active**. It is *not* a calculated completion percentage or a machine integration.

## Screens

| Screen | Purpose |
| --- | --- |
| Dashboard | Weekly summary and history |
| Fill Task | Plan new tasks |
| Job | Start, Pause, Resume, and Done actions |
| Live | Today's full-screen production board |
| Team Settings | Users, lines, memberships, and Job List |
| User Profile | Update display name and password |

## Quick start

**Requirements:** Node.js 24+, npm. A Cloudflare account and your own D1 database are needed for a working server-backed installation.

```bash
git clone https://github.com/park13z/Job-Task.git
cd Job-Task
npm ci
npm run typecheck
npm run build:pages
```

For frontend development, run `npm run dev`. The Vite development server proxies API calls to port `8787`; it cannot log in or save tasks without a running local API and D1 database.

See **[Setup and deployment](docs/SETUP.md)** for the private Wrangler configuration, schema migrations, Manager bootstrap, and Pages deployment steps.

## Project structure

```text
src/features/         React screens and Live Board styles
src/components/       Shared UI controls
src/hooks/            Workspace loading, queries and sync policy
src/lib/              API client and operation helpers
src/shared/           Contracts, date helpers, workflow rules
src/worker/           Hono API, sessions, line permissions and D1 operations
src/pages-worker.ts   Cloudflare Pages advanced-mode entry point
design/               Design tokens
migrations/           D1 schema migrations
scripts/              Local development and bootstrap utilities
tests/                Vitest and Playwright tests
wrangler.example.jsonc         Pages configuration template
wrangler.worker.example.jsonc  Local Worker configuration template
```

## Checks

```bash
npm run check

# For the full Cloudflare Pages output when preparing your own deployment:
npm run build:pages

# Install a browser first if Chromium is unavailable:
npx playwright install chromium
```

The automated tests use local fixtures/test databases; they are **not** evidence that any specific Cloudflare deployment or live Login has been tested. Consult the results in your own environment.

## Security and privacy

This public code does **not** include the owner's Cloudflare account identifiers, live D1 connection settings, credentials, employee records, database exports, production operational notes, or original internal Git history.

- Copy the **example** Wrangler files and enter *your own* Cloudflare identifiers in the ignored local configs.
- Never commit `.env*`, `.dev.vars*`, `.local/`, generated SQL with password hashes, database backups, or production data.
- Native username/password authentication uses salted password hashes in D1 and an HttpOnly secure session cookie; application roles and line permissions are enforced server-side.
- No public self-registration is provided. Provision your initial Manager securely before using the app.
- The software runs on your infrastructure; no access to the maintainer's production account or database is supplied.

## Contributing

Bug reports, suggestions, and pull requests are welcome. Please check **[Contributing](docs/CONTRIBUTING.md)**, keep changes tightly scoped, and avoid including private information in examples or screenshots.

## License and developer credit

**Copyright © 2026 Sanongboon Poona / Truly Green Farms.**

The source code is free to use, modify, and redistribute under the [MIT License](LICENSE), provided the copyright and license notice is retained in copies or substantial portions of the software. Developed by **Sanongboon Poona / Truly Green Farms**.

**Artwork notice:** The animated sprite artwork in `src/features/live-worker-sheet.png` may have separate rights. Its inclusion in this repository is not a representation that third-party artwork rights have been cleared. Check permission before reusing or redistributing the artwork.

---

**ภาษาไทย:** Job Task เป็นเว็บแอปวางแผนงานไลน์ผลิต ติดตาม Start/Pause/Resume/Done และแสดงงานวันนี้บนหน้า Live แบบเต็มจอ สำหรับผู้สนใจนำแนวทางไปต่อยอด โปรดใช้ Cloudflare/D1 และข้อมูลผู้ใช้ของตนเอง ไม่ใช้การตั้งค่าระบบ Production ของผู้พัฒนา
