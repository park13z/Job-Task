# Job Task

**A line-based production job planner and real-time operations wallboard.**

Job Task is a web app designed for packhouses and production teams. Plan work for the week, start and pause tasks on a production line, record completion, and display active work and due tasks on a full-screen Live Board. The application can be adapted to other team-based workflows.

**Built with:** React, TypeScript, Vite, Tailwind CSS, Hono, Cloudflare Pages/Workers, and Cloudflare D1 (SQLite).

## Features

- **Weekly planning:** Create tasks for a production line and date, with optional descriptions and skid targets. The server assigns weekly sequence numbers across all lines (Monday–Sunday, `America/Toronto`).
- **Execution workflow:** Waiting → In Progress → Paused → Resume or Done. The server records timestamps; active work time excludes paused intervals.
- **Queue management:** In Fill Task choose a date and line, add an **Inserted #N** job above a normal Queue number, or Delete/Cancel/Recall waiting orders. Cancelled rows remain visible (dark) in Fill Task for Recall but are hidden from Live; Delete permanently removes unstarted jobs. Each change requires a reason, stored with actor and time.
- **Safe queue reordering:** Waiting rows can be dragged after **Unlock Queue** (a safety button, no password). **Undo** reverses each unsaved drag one at a time; **Save** requires a reason; **Lock Queue** protects against accidental movement and prompts before discarding unsaved edits. Normal Queue numbers compact automatically while Inserted badges remain distinct.
- **One active job per line:** A production line may have multiple queued or paused jobs, but only one job can be **In Progress** on that line at a time. Other lines work independently.
- **Live wallboard:** Shows due/overdue Waiting Queue jobs, all currently In Progress or Paused jobs (even from earlier dates), and jobs completed today. Includes full-screen mode, adaptive row density, distinct status colors, and animated walking workers.
- **Dashboard and history:** Review tasks, dates, statuses, and work time beyond the Live display.
- **Role and line controls:** Manager, Supervisor, Line Leader, and Assistant access with line membership rules.
- **Reusable job names:** Managers maintain the Job List; planners can select or enter their own task titles.
- **User profile:** Users can update their display name and password.

The Live progress animation means **a task is active**. It is *not* a calculated completion percentage or a machine integration.

## Working on a production line

1. **Plan:** In **Fill Task**, select a work date and production line, then save one or more jobs. Multiple **Waiting** jobs can be assigned to the same line. Work scheduled for a future date may be started early.
2. **Start:** On the **Job** screen, press **Start** for a waiting job. It becomes **In Progress** and occupies its assigned production line. Only **one In Progress job per line** is allowed across *all dates and weeks*, not just the week currently shown.
3. **Line already occupied:** If another job on that line is running, **Start** or **Resume** is disabled and the screen identifies the running job. The API also rejects competing attempts with HTTP `409 CONFLICT`; the restriction is not just a visual warning.
4. **Pause:** Press **Pause** to stop recording active work time and release the line. Another queued job on the same line may now start.
5. **Resume:** A paused job can resume only when its line has no other In Progress job. If another job took the line, pause or complete that job first.
6. **Done:** Confirm **Done** to finish a running **or paused** job and release the line. Completed work remains available in **Dashboard/history**; a Done job cannot be resumed.

**Example:** Line A can queue Jobs 101 and 102, but cannot run both at once. While Job 101 is In Progress, Job 102 must wait. Pausing or completing Job 101 frees Line A for Job 102. Meanwhile, Line B can run a job at the same time as Line A.

**Live Board visibility:** In Progress and Paused jobs remain visible regardless of their scheduled date; Waiting jobs appear when their work date is today or overdue; Done shows jobs completed today (Toronto time). A future Waiting job does not appear on Live until due, although it can be started early from the Job screen.

### Database protection for one running job per line

The application checks line occupancy in the API and uses `migrations/0007_single_active_job_per_line.sql` to establish a unique D1/SQLite index for atomic protection against simultaneous Start/Resume requests. The index applies only to jobs with `status='in_progress'`; Waiting, Paused, and Done jobs do not occupy a line.

For an **existing database**, check for conflicting running jobs before applying migration 0007:

```sql
SELECT line_id, COUNT(*) AS running_jobs
FROM jobs
WHERE status = 'in_progress'
GROUP BY line_id
HAVING COUNT(*) > 1;
```

If this query returns any rows, review and resolve those jobs through the normal workflow before applying the migration. The migration **fails intentionally** when duplicates exist; it does not change their statuses or remove data. New installations should apply all migrations in numerical order; migrations **0007 and 0008** are **not** automatically applied to an existing live database by updating the code. Migration 0008 adds separate queue positions, cancelled/inserted flags and the reason audit table; apply it deliberately during an authorized future release, never to production as part of local development.

## Screens

| Screen | Purpose |
| --- | --- |
| Dashboard | Weekly summary and history |
| Fill Task | Plan new tasks, Insert/Delete/Cancel/Recall orders and safely reorder Waiting Queue jobs |
| Job | Start, Pause, Resume, and Done actions |
| Live | Full-screen view of active/paused work, due or overdue queue, and today's completions |
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

**ภาษาไทย:** Job Task เป็นเว็บแอปวางแผนงานไลน์ผลิต ติดตาม Start/Pause/Resume/Done และแสดงงานที่กำลังทำ งานหยุดพัก งานรอคิวที่ถึงกำหนด และงานที่เสร็จวันนี้บนหน้า Live แบบเต็มจอ **แต่ละไลน์มีงาน In Progress ได้เพียง 1 งานในเวลาเดียวกัน** เมื่อ Pause หรือ Done จะเปิดให้เริ่มงานถัดไปในไลน์นั้นได้ ส่วนไลน์อื่นทำงานพร้อมกันได้ตามปกติ สำหรับผู้สนใจนำแนวทางไปต่อยอด โปรดใช้ Cloudflare/D1 และข้อมูลผู้ใช้ของตนเอง ไม่ใช้การตั้งค่าระบบ Production ของผู้พัฒนา
