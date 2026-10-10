# Set up your own Job Task instance

These instructions are for **a new instance in your own Cloudflare account**. Do not deploy against someone else's D1 database.

## 1. Install and build

Use Node.js 24+ and npm.

```bash
npm ci
npm run typecheck
npm run build:pages
```

The Pages build creates `dist/index.html`, static assets, and `dist/_worker.js` (the API Worker). Deploying only the static assets without the Worker prevents API requests from working.

## 2. Create private Wrangler configs

Start from the tracked, sanitized templates:

- `wrangler.example.jsonc` → `wrangler.jsonc` for Cloudflare Pages.
- `wrangler.worker.example.jsonc` → `wrangler.worker.jsonc` for optional local Worker development.

Both destination files are Git-ignored. Replace the example D1 ID with the identifier of a **new** database that you own, and adjust project/database names.

Review the [Cloudflare D1 docs](https://developers.cloudflare.com/d1/) and [Pages docs](https://developers.cloudflare.com/pages/) for current CLI options.

## 3. Prepare your own D1 database

Create a D1 database in your account, then apply the files in `migrations/` **in numerical order**. On a fresh database you can use Wrangler D1 migrations. Use a local/test database first, verify the schema, and back up your database before any remote migration.

The app expects the D1 binding name **`DB`**. Other bindings or hard-coded IDs do not replace it.

## 4. Provision the first Manager

Job Task uses username/password login with hashed credentials stored in D1. There is no public signup or default password.

On Windows PowerShell, from the repository folder:

```powershell
powershell -NoProfile -File scripts/setup-first-manager.ps1 -Username manager -Name "Manager"
```

The script securely prompts for the password and produces `.local/bootstrap-manager.sql` (a **hash-containing** SQL file, not for public sharing). Review it and run it **only against your own empty D1 database** after applying migrations. Verify the Manager record before logging in. Do not put the password in your CLI arguments, commits, or screenshots.

The supplied scripts for administrative recovery are utilities, not automatic public onboarding endpoints. Review them for your own deployment requirements.

## 5. Develop locally

- `npm run dev` starts the frontend; `/api` is proxied to `http://localhost:8787`.
- `npm run build` builds static assets and the Worker.
- `npm run dev:worker` uses your ignored `wrangler.worker.jsonc` for local Worker development.
- To run browser tests against isolated fixtures, use `npx playwright test`.

## 6. Deploy your own Pages project

Create/select a Cloudflare Pages project in your own account. Build with `npm run build:pages` and upload `dist` to **your** Pages project. Check the Cloudflare output for **Compiled Worker successfully** and **Uploading Worker bundle** before treating the deployment as complete.

Verify the API and account authorization in your instance before inviting users. Do not reuse the original project's domain, D1 ID, credentials, or employee data.

## Troubleshooting

- **Login redirects or API returns HTML:** The Pages Worker bundle may not have been included. Confirm `dist/_worker.js` was built and uploaded.
- **D1 error:** Verify your own `DB` binding and applied migration level.
- **Frontend loads but actions fail:** The frontend alone cannot serve the `/api` routes.

Environment variables, machine-specific notes, operational database exports and backup files are intentionally excluded from this public repository.
