# First-run setup

Linear checklist for getting from cloned repo to a working local instance,
then to production. Each section is a prerequisite for the next.

The README is the reference doc; this file is what you actually walk through.

---

## 0. What you need on hand

- A Supabase project (Sydney region per spec)
- Node 18+ and npm
- A terminal with `openssl` (any modern macOS / Linux / Git-Bash on Windows)

The integrations (OneSignal, Twilio, Xero, Square) are **not** required for
local development — every integration degrades gracefully when its env vars
are missing. Wire them later, on Vercel.

---

## 1. Local install

```bash
npm install
cp .env.local.example .env.local
```

---

## 2. Apply the database migrations

In the Supabase SQL editor, paste each of these files in order and run:

```
supabase/migrations/0001_enquiries.sql
supabase/migrations/0002_users.sql
supabase/migrations/0003_clients_and_jobs.sql
supabase/migrations/0004_roster_and_leave.sql
supabase/migrations/0005_assets_and_audit_log.sql
supabase/migrations/0006_materials_and_config.sql
supabase/migrations/0007_notifications_sms_xero.sql
supabase/migrations/0008_rls_policies.sql
supabase/migrations/0009_seed_users_and_inventory.sql
supabase/migrations/0010_storage_bucket.sql
```

Or, if you've installed the Supabase CLI and linked the project:

```bash
supabase db push
```

After 0009 you should have:
- 1 admin (Thomas, password `ChangeMe!2025`)
- 4 workers (PIN `1234` each)
- 18 assets across 5 categories
- 12 materials catalogue rows
- Seeded config (rates, NDIS code, markup)

After 0010 you should see a `job-photos` bucket in Supabase → Storage.

---

## 3. Fill `.env.local`

Open `.env.local` and set at least these:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase → Settings → API → "service_role" key>

NEXTAUTH_SECRET=<run: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
```

Leave the integration env vars empty for now.

---

## 4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000 — you should land on the marketing home page.

---

## 5. Smoke check

In a separate terminal:

```bash
npm run smoke
```

Every route should report ✓. If anything is ✗, post the output and we diagnose.

---

## 6. Sign in as Thomas

1. Visit http://localhost:3000/login
2. Click the **Admin** tab
3. Email: `t.rdepledge@outlook.com`
4. Password: `ChangeMe!2025`
5. You should land on `/admin` with the dashboard

**Change Thomas's password** before doing anything else: tap his name in
the top bar → `/admin/account` → fill the form. New password takes effect
on next sign-in.

---

## 7. Test a worker login

1. /login → **Worker** tab
2. Pick `Bradley Depledge` (or any seeded worker)
3. PIN `1234`
4. You should land on `/worker`

**Change the worker's PIN** the same way: tap their name in the top bar →
`/worker/account` → enter current PIN `1234`, set a new one. Each worker
should do this on their first sign-in.

---

## 8. Click through the field app

A 5-minute walk-through to verify everything wires together:

- `/admin` — dashboard shows live counts
- `/admin/jobs/new` — create a test job, assign yourself a worker
- `/admin/jobs/[id]` — see the job detail; add a note; add a material
- Sign out, sign back in as the assigned worker
- `/worker/jobs/[id]` — clock in, add waiting time, take a photo, clock out
- Back as admin: see the time recorded, the photo, the note
- Cost breakdown should show labour hours and materials

---

## 9. Run the E2E tests (optional but recommended)

Playwright tests live in `e2e/`. They drive a real browser against the
running dev server.

```bash
# One-time: install the Chromium binary (~100 MB)
npm run test:e2e:install

# Run the full suite (auto-starts the dev server if one isn't already up)
npm run test:e2e

# Or use the interactive UI
npm run test:e2e:ui
```

Coverage:
- public marketing pages render + contact form submits
- admin login, worker login, wrong-creds errors
- admin job CRUD round trip (create → list → edit status → reopen → delete)
- admin page-render smoke (every authenticated admin page, no runtime errors)
- worker page-render smoke (mobile viewport)

**Worker tests** assume the seeded PIN `1234`. Override via `E2E_WORKER_NAME`
and `E2E_WORKER_PIN` if you've rotated.

**Admin tests** are **opt-in** via `E2E_ADMIN_PASSWORD`. They're skipped
otherwise — the seed password rotates immediately on first deploy, and
attempting it repeatedly would trip the 5-fail account lockout from
migration 0011. To run the admin suite:

```bash
E2E_ADMIN_PASSWORD="<your current admin password>" npm run test:e2e
```

If you somehow lock yourself (or Thomas) out from password rotation
attempts, clear the lockout via SQL:

```sql
update public.users
set failed_login_attempts = 0, locked_until = null
where role = 'admin';
```

---

## 10. Generate icons (one-time)

If you ever change `public/logo.svg`, regenerate the PWA icons:

```bash
npm run generate-icons
```

This rewrites `public/apple-touch-icon.png`, `public/icons/icon-{192,512}.png`,
and `public/favicon.ico`.

---

## 11. Production deploy (Vercel)

1. **Push the repo to GitHub** at `github.com/trdepledge-app/trdepledge-app`.
2. **vercel.com → New Project** → import the repo.
3. **Set environment variables** in Vercel's dashboard:
   - The same five from step 3, but set `NEXTAUTH_URL=https://app.trdepledgegardeningandmaintenance.com`
   - Add `CRON_SECRET=<random string>` (any reasonably long random value)
   - Optionally add the integration vars (see "Wire integrations" below)
4. **Domains**: in Vercel → Settings → Domains, add
   `app.trdepledgegardeningandmaintenance.com` and (when ready) the apex
   `trdepledgegardeningandmaintenance.com`. Both serve the same deploy.
5. **First deploy** happens automatically on `git push origin main`.
6. **Run the smoke check against production**:
   ```bash
   BASE_URL=https://app.trdepledgegardeningandmaintenance.com npm run smoke
   ```

---

## 12. Wire integrations (post-deploy)

Order doesn't matter — each is independent.

### OneSignal (push notifications)
1. Create a Web Push app at onesignal.com using the existing app id from spec
2. Set in Vercel: `NEXT_PUBLIC_ONESIGNAL_APP_ID` + `ONESIGNAL_REST_API_KEY`
3. Redeploy
4. On a worker's phone: log in → permission prompt appears → accept

### Twilio (SMS)
1. Set in Vercel: `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`
2. Redeploy
3. Test by submitting the public contact form with your own phone number — you
   should receive the auto-reply within ~10 seconds

### Xero (invoicing + payroll)
1. developer.xero.com → register an OAuth 2 app
2. Redirect URI: `https://app.trdepledgegardeningandmaintenance.com/api/admin/xero/callback`
3. Set in Vercel: `XERO_CLIENT_ID` + `XERO_CLIENT_SECRET` + `XERO_REDIRECT_URI`
4. Redeploy
5. As Thomas: `/admin/settings` → click **Connect Xero** → authorise → return

### Square (booking webhook)
1. Square dashboard → Webhooks → add subscription
2. URL: `https://app.trdepledgegardeningandmaintenance.com/api/webhooks/square`
3. Subscribe to: `payment.created` and `payment.updated`
4. Copy the signature key
5. Set in Vercel: `SQUARE_ACCESS_TOKEN` + `SQUARE_LOCATION_ID` + `SQUARE_WEBHOOK_SIGNATURE_KEY`
6. Redeploy

---

## 13. Vercel Cron

`vercel.json` schedules `/api/cron/job-reminders` daily at 08:30 UTC, which
is **6 PM ACST** (winter) / **7 PM ACDT** (summer).

**Hourly cron disabled on Hobby plan**: `/api/cron/shift-reminder` (the
"shift starting in 1 hour" worker push) needs an hourly schedule, which
Vercel Hobby doesn't allow. The endpoint code is shipped and will work
on Vercel Pro — just add this to the `crons` array in `vercel.json`:

```json
{ "path": "/api/cron/shift-reminder", "schedule": "0 * * * *" }
```

Until then, workers still get the daily 6pm push for tomorrow's jobs.
Manual trigger for testing: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.../api/cron/shift-reminder`

The endpoint requires `Authorization: Bearer $CRON_SECRET`. Vercel sends this
automatically when `CRON_SECRET` is in your env.

To test manually after deploy:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://app.trdepledgegardeningandmaintenance.com/api/cron/job-reminders
```

It returns JSON with how many SMSes and pushes were dispatched.

---

## Known gaps to close before going fully live

These don't block deployment, but they're real and worth budgeting:

- **Direct Xero Payroll push is a stub.** CSV export works; direct API push
  needs each worker mapped to their Xero employee record (TFN, super, leave
  types) — that's a workflow we haven't designed. Use the CSV until then.
- **Manual SMS phone lookup still falls back to enquiries** when a job has
  no linked `client_id`. Once you populate the clients table (now CRUD-able
  at `/admin/clients`, or auto-populated by the Xero invoice flow), this
  becomes deterministic.
- **No SMS / push retry queue.** A failed Twilio or OneSignal call is logged
  with status but not retried. For our volume that's fine; if delivery rates
  ever matter, wire a queue.
- **iOS PWA install requires `apple-touch-icon.png`** which `npm run generate-icons`
  produces — make sure it's deployed.
- **Cron times drift ±1hr with daylight saving** (Vercel Cron is UTC only).
  Documented in README under "Vercel Cron".

When you hit one of these in real use, that's the natural moment to fix it —
let me know and I'll close the gap.
