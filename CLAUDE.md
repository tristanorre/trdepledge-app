# CLAUDE.md

Notes for future Claude (or Cursor / Copilot / human dev) sessions on this codebase.
The README is the user-facing documentation; this file captures the *design decisions*
that aren't obvious from the code, so you can extend the app without reinventing them.

## What this is

Next.js 14 App Router monorepo serving:

1. **Public marketing site** (`(marketing)` route group) — 6 pages, hand-authored CSS
   matching an approved HTML prototype. Statically generated.
2. **Field service management app** for T.R. Depledge Gardening & Maintenance —
   dynamic, authenticated, admin + worker roles, mobile-first PWA.

Both ship from one Vercel deploy on different subdomains.

## Architectural decisions you must respect

### Auth: NextAuth, not Supabase Auth
- Sessions live in NextAuth JWTs. The Supabase anon key is unused at runtime.
- All DB access goes through the **service-role key** in server routes.
- RLS is enabled on every business table but has **no permissive policies for anon
  or authenticated** — the anon key is locked out at the database. The service
  role bypasses RLS, which is fine because only our server code holds it.
- Don't switch to Supabase Auth without rewriting RLS for `auth.uid()`-based access.

### Audit log is immutable at the database level
- `public.audit_log` has BEFORE UPDATE/DELETE triggers that raise exceptions.
- UPDATE/DELETE/TRUNCATE privileges are revoked from every role *including
  `service_role`*. Triggers bypass-proof the table.
- If you ever need to "edit" audit history, you're working around the wrong layer.
  Add a follow-up entry that explains the correction instead.

### Money is integers (cents). Always.
- `base_price_cents`, `private_rate_cents`, etc. — never floats.
- `src/lib/cost.ts` is the single source of truth for per-job calculations.
- Format with `fmtMoney(cents)` at the edge, never in the middle.

### Integrations degrade gracefully
- Each of OneSignal / Twilio / Xero / Square has a `<name>Configured()` helper
  in [`src/lib/integrations.ts`](src/lib/integrations.ts).
- Helpers (`sendSms`, `sendPush`, etc.) check this and **become no-ops** with
  a `console.warn` when env vars are missing. They still write to the relevant
  log tables (`sms_log`, `notifications`) so the app's history reflects intent.
- Never throw from an integration call inside an unrelated business action.
  A failed SMS must not roll back a successful job creation.

### Photos use signed URLs, not public storage
- `job-photos` is a private Supabase Storage bucket.
- Server pages call `signPhotoUrls(supabase, paths)` (1-hour TTL) to render.
- API routes upload server-side via service role; never expose direct client
  uploads with the anon key.

### Worker authorisation is via `.contains()` filter
- Workers see only jobs where their UUID is in `assigned_worker_ids`.
- Every worker query has `.contains("assigned_worker_ids", [session.user.id])`.
- Returning 404 (not 403) for unauthorised access is a deliberate choice —
  don't leak whether a job exists.

## Code patterns

### API auth
```ts
const auth = await requireApiAdmin(); // or requireApiWorker
if (auth instanceof NextResponse) return auth;
const { session } = auth;
```
Helper at [`src/lib/api-auth.ts`](src/lib/api-auth.ts). Returns either a session
object or a pre-built error response — saves a guard ladder in every route.

### Server pages
```tsx
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  await requireAdmin(); // or requireWorker
  const supabase = getServiceClient();
  if (!supabase) return <Banner>DB not configured</Banner>;
  // …
}
```
[`src/lib/session.ts`](src/lib/session.ts) provides `requireAdmin()` /
`requireWorker()` for server components. Middleware does the
fast-path redirect; page-level helpers are the source of truth.

### Audit-logged mutations
For any inventory write, use [`writeAuditEntry()`](src/lib/audit.ts) right after
the asset update. Don't add a new path that mutates `assets` without an audit
companion — the spec requires the audit log to reflect every change.

## Common gotchas

- **Migrations apply in order.** Numbers matter; `0006` adds an FK to a column
  declared in `0003` because `0006` is when materials_catalogue exists. Don't
  renumber migrations.

- **`crypt()` (pgcrypto) → `bcryptjs.compare()`.** Both speak bcrypt. The
  pgcrypto seed produces `$2a$10$…` hashes; bcryptjs accepts those fine.
  Don't switch to argon2 without updating both ends.

- **`time_log` is `{ start, end }` JSONB, not a separate table.** Single pair
  per job. Multi-segment time tracking would need a schema change — the
  spec didn't ask for it.

- **Job duration in the Time Allocation Board defaults to 1 hour.** The schema
  has `scheduled_time` but no `duration_minutes`. Adding a duration column
  would be a Slice-9 chore.

- **Vercel Cron is UTC only.** `vercel.json` schedules at `30 8 * * *` UTC,
  which drifts ±1hr with Australian daylight saving. Document this when changing.

- **OneSignal SDK + service worker.** Our `/sw.js` `importScripts` OneSignal's
  worker. They share scope `/`. Don't register a second SW or push will break.

- **Manual SMS lookups fall back to enquiry-by-name.** The clients table is
  underpopulated; SMS resolution does best-effort matching. When clients CRUD
  ships, switch to the linked client_id only.

## File map

```
src/
├── app/
│   ├── (marketing)/           # public site, hand-authored CSS
│   ├── admin/                 # admin app (requireAdmin in layout)
│   ├── worker/                # worker app (requireWorker in layout)
│   ├── login/                 # full-screen sign-in
│   ├── api/
│   │   ├── admin/             # admin-only endpoints
│   │   ├── worker/            # worker-only endpoints
│   │   ├── jobs/              # mixed-role endpoints (e.g. photos POST)
│   │   ├── auth/              # NextAuth + worker list
│   │   ├── webhooks/          # Square (no auth — verifies HMAC)
│   │   ├── cron/              # Vercel Cron (auth via CRON_SECRET)
│   │   └── enquiries/         # public contact form
│   ├── globals.css            # marketing-only CSS, ported from prototype
│   └── layout.tsx             # bare html/body + fonts + SW register
├── components/                # shared client + server components
├── lib/                       # business logic and helpers
├── types/                     # TypeScript declaration files
└── middleware.ts              # /admin and /worker route gating

supabase/
└── migrations/                # 0001..0010 — apply in order

public/
├── images/                    # extracted from marketing prototype
├── logo.svg                   # primary brand mark
├── sw.js                      # service worker (PWA + OneSignal)
├── OneSignalSDKWorker.js      # legacy fallback (kept for safety)
└── manifest.webmanifest       # PWA manifest

scripts/
└── extract-images.mjs         # one-off marketing-image extractor
```

## When extending

- **New table?** Add a migration, add types to `src/lib/types.ts` (or a topic-specific
  file like `types-inventory.ts`), enable RLS in the migration with no permissive
  policies, revoke privileges from `anon`.
- **New mutation?** Add the API route under the right role prefix; if it's a
  worker mutation, include the `.contains("assigned_worker_ids", ...)` filter.
- **New integration?** Add to `src/lib/integrations.ts`, write a helper in
  `src/lib/<name>.ts` with a graceful no-op path, surface status on
  `/admin/settings`.
- **Spec change?** Update README's "Build status" table to reflect what shipped
  vs. deferred.
