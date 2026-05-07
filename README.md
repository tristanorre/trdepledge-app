# T.R. Depledge — Website + Field Management App

Next.js 14 monorepo serving:

- **`trdepledgegardeningandmaintenance.com`** — public marketing website (6 pages).
- **`app.trdepledgegardeningandmaintenance.com`** — staff field management PWA (admin + workers).

Both share one Supabase database and one deploy.

## Stack

- Next.js 14 (App Router), React 18, TypeScript
- Supabase (Postgres + RLS + Storage)
- NextAuth.js (Credentials provider — admin email/password + worker PIN)
- Tailwind CSS (utilities — marketing pages use hand-authored CSS to match approved prototype 1:1)
- DM Sans + DM Serif Display via `next/font`
- OneSignal (push), Twilio (SMS), Xero (invoicing)
- Vercel hosting (Cron + serverless functions)

## Run locally

```bash
npm install
cp .env.local.example .env.local         # see "Environment" below
npm run dev                              # http://localhost:3000
```

## Environment

The first group is required for any meaningful local run; the second is added post-deployment via Vercel's environment-variable UI:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXTAUTH_SECRET=...                       # generate: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000        # production: https://app.trdepledgegardeningandmaintenance.com

# Optional — each integration degrades gracefully if missing
NEXT_PUBLIC_ONESIGNAL_APP_ID=
ONESIGNAL_REST_API_KEY=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=https://app.trdepledgegardeningandmaintenance.com/api/admin/xero/callback
XERO_SALES_ACCOUNT_CODE=200               # override if your Xero chart of accounts differs

# Vercel Cron auth — set to a random string and Vercel will pass it in
CRON_SECRET=...

# Email destination for new website enquiries (logged today; emailing wired later)
ENQUIRY_NOTIFY_EMAIL=t.rdepledge@outlook.com
```

Without integration credentials, the contact form, push, SMS, and Xero paths log a warning and become no-ops. Job management, scheduling, HR, inventory, and time tracking work fully without any third-party.

## Database

Migrations live in `supabase/migrations/` — apply them in numeric order via the Supabase SQL editor (or `supabase db push` if you're using the CLI):

```
0001_enquiries.sql              public website contact form table
0002_users.sql                  users + bcrypt fields + updated_at trigger
0003_clients_and_jobs.sql       clients, jobs, job_materials
0004_roster_and_leave.sql       roster, leave_requests, leave_balances
0005_assets_and_audit_log.sql   assets + immutable audit_log (triggers)
0006_materials_and_config.sql   materials_catalogue + seeded config
0007_notifications_sms_xero.sql notifications, sms_log, xero_tokens
0008_rls_policies.sql           RLS lockdown — anon denied across the board
0009_seed_users_and_inventory.sql Thomas + 4 workers + assets + materials
0010_storage_bucket.sql         private `job-photos` Supabase Storage bucket
```

### Seed credentials (change on first login!)

The 0009 seed creates these accounts:

| Role     | Name                  | Login                                                        | Temp credential   |
|----------|-----------------------|--------------------------------------------------------------|-------------------|
| admin    | Thomas Depledge       | `t.rdepledge@outlook.com`                                    | `ChangeMe!2025`   |
| worker   | Bradley Depledge      | (select from list at /login)                                 | PIN `1234`        |
| worker   | Aleisha Bussenschutt  | (select from list at /login)                                 | PIN `1234`        |
| worker   | Darrell Woods         | (select from list at /login)                                 | PIN `1234`        |
| worker   | Dave Kay              | (select from list at /login)                                 | PIN `1234`        |

Hashes use bcrypt via pgcrypto (`crypt(pw, gen_salt('bf', 10))`) — the resulting `$2a$10$…` strings are compatible with `bcryptjs.compare()` in the NextAuth provider.

### Audit log immutability

`public.audit_log` is append-only at the **database** level, not just the application:

- BEFORE UPDATE / BEFORE DELETE triggers raise an exception (the service role key cannot bypass triggers).
- UPDATE / DELETE / TRUNCATE privileges are revoked from `public`, `anon`, `authenticated`, *and* `service_role`.

If your code or a migration ever needs to UPDATE/DELETE on this table, the design is wrong — fix the source of the change instead.

## Auth model

NextAuth (not Supabase Auth) handles sessions. All DB access uses the service-role key from server routes. The Supabase anon key has no usable policies. RLS is on for every table; the service role bypasses RLS, but `audit_log` triggers still block writes.

## Routes

### Public (marketing)
```
/                  Home
/services          Services
/ndis-aged-care    NDIS & Aged Care
/about             About
/gallery           Gallery
/contact           Contact form
```

### Auth + app
```
/login             Staff sign-in
/admin             Admin dashboard
/admin/jobs        Jobs list + filters
/admin/jobs/new    Create job
/admin/jobs/[id]   Job detail (notes, materials, costs, photos, SMS, Xero)
/admin/enquiries   Website enquiries inbox
/admin/schedule    Daily lane view (all workers)
/admin/time        Time Allocation Board (15-min grid)
/admin/hr          HR landing
/admin/hr/roster   Weekly roster editor
/admin/hr/leave    Leave inbox + balances
/admin/hr/payroll  Weekly hours + CSV export
/admin/inventory   Asset list + filters + by-worker view
/admin/inventory/[id]    Asset manage
/admin/inventory/new     Create asset
/admin/inventory/audit   Immutable audit feed
/admin/settings    Integration status + Xero connect

/worker            Today / upcoming jobs
/worker/jobs/[id]  Job detail (clock in/out, waiting, photos, notes, map)
/worker/schedule   Personal day view
/worker/leave      Balances + submit + history
```

### Cron
```
GET  /api/cron/job-reminders           Vercel Cron (08:30 UTC daily)
```

## Vercel Cron

`vercel.json` schedules `/api/cron/job-reminders` at `30 8 * * *` UTC.

That works out to:
- **6:00 PM ACST** (Apr–Oct, standard time)
- **7:00 PM ACDT** (Oct–Apr, daylight saving)

Vercel Cron only speaks UTC, so the run-time drifts an hour with daylight saving. Acceptable for a "night before" reminder; if you need to lock it to local 6pm year-round, add a 2-cron schedule and gate the body on the day of year, or run hourly and use a window check.

The endpoint requires `Authorization: Bearer $CRON_SECRET` — Vercel sends this automatically when `CRON_SECRET` is set in env. Set the same value in Vercel's environment variables.

## Deploying to Vercel

1. **Connect the GitHub repo** at vercel.com → New Project.
2. **Set environment variables** (all the ones above; integration ones are optional but enable features).
3. **Domains**: configure `app.trdepledgegardeningandmaintenance.com` for the field app and (optionally) `trdepledgegardeningandmaintenance.com` for the marketing site. The codebase is one project — both domains hit the same deploy.
4. **Apply Supabase migrations** in order via the Supabase SQL editor.
5. **First deploy** — push to `main`; Vercel builds.
6. **Post-deploy setup**:
   - Sign in as Thomas → change his password from the seed default.
   - Have each worker open the worker URL on their phone, log in with PIN `1234`, change the PIN.
   - On first worker login, the OneSignal SDK prompts for notification permission — accept it.
   - Connect Xero from `/admin/settings` (OAuth flow).
   - In Twilio, configure the messaging service for the AU number listed in the spec.

## PWA

- `manifest.webmanifest` declares the app, icons (SVG + 192/512 PNG), shortcuts to Jobs/Schedule/Inventory.
- `/sw.js` is the service worker. It imports OneSignal's SW (push handling) and adds a stale-while-revalidate cache for `/admin` and `/worker` pages, so the team can open the app offline and still see what they had loaded.
- Registered by `<ServiceWorkerRegister />` in the root layout.

**Icons**: the manifest declares `/public/logo.svg` for all sizes; PWA + iOS bitmaps are generated by `scripts/generate-icons.mjs`, which letterboxes the wide logo onto navy and writes `apple-touch-icon.png` (180×180), `icons/icon-192.png`, `icons/icon-512.png` and `favicon.ico`. Re-run with `node scripts/generate-icons.mjs` whenever `logo.svg` changes.

## Offline behaviour

The service worker caches:
- App shell (`/`, `/login`, logo, manifest) on install.
- `/admin/*` and `/worker/*` page navigations on first hit (stale-while-revalidate).
- Static images, fonts, CSS (cache-first).

API responses are **never cached** — `/api/*` always goes to the network. So a worker offline at a job site can re-open a previously-viewed job page (sees the cached HTML) but can't load fresh data or submit clock-in actions until they're back online. Mutations queue in the browser fetch — they'll error visibly, no silent loss.

## Build status

- [x] **Slice 1** — Auth, full Supabase schema, RLS, immutable audit log, seed
- [x] **Slice 2** — Public marketing website (all 6 pages match approved prototype)
- [x] **Slice 3** — Job Management (CRUD, assignment, enquiry conversion)
- [x] **Slice 4** — Time tracking, materials & costing, photos
- [x] **Slice 5** — Schedule, Time Allocation Board, HR/roster/leave
- [x] **Slice 6** — Inventory module + immutable audit feed UI
- [x] **Slice 7** — OneSignal, Twilio, Xero OAuth + Settings
- [x] **Slice 8** — Xero invoice + payroll CSV, Vercel cron, PWA, deploy notes

## Image extraction

If the marketing prototype is updated:

```bash
npm run extract-images "/path/to/prototype.html"
```

Pulls every base64-embedded image into `public/images/` with semantic filenames.
