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
- Each of OneSignal / Twilio / Xero has a `<name>Configured()` helper
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

### DIY Hire: the availability engine is the single source of truth

- `src/lib/hire/` implements the hire rules **once, server-side**. The public
  calendar, the admin calendar and Doug's tools all call it. Never
  re-implement availability in the browser or describe it in a prompt.
- Split is deliberate: `availability.ts` / `charging.ts` are **pure** (they take
  an `AvailabilityContext` — today's date, the holds, the changeover gap — and
  return an answer), `repo.ts` is the only file that touches Supabase. That's
  what makes the rules unit-testable with no database (`npm run test:unit`).
- **The invariant:** the days the engine calls unavailable must be a *superset*
  of what the `no_double_booking` exclusion constraint rejects. The database
  enforces; the engine predicts. If the engine ever says "free" where the
  constraint says "no", a customer is told their dates are held and then hits
  an error.
- The constraint uses `daterange(starts_on, ends_on, '[]')` — **inclusive both
  ends**, so the return day is already held. A tool back on Tuesday cannot be
  collected by someone else on Tuesday. `changeover_days` (per item, default 0)
  extends that tail further. Verified against the live constraint, not assumed.
- **Hire money is `numeric(10,2)` in the database, integer cents in the code.**
  The hire schema diverges from the house cents-everywhere rule, so `repo.ts`
  converts at the boundary (`toCents` / `toDbAmount`) and every calculation
  above it is exact integer arithmetic. Don't do arithmetic on the raw column.
- `src/lib/hire/dates.ts` does its own ISO/epoch-day arithmetic rather than
  reusing `src/lib/dates.ts`'s `fromISODate`. Hire dates are pure calendar
  values, and the epoch-day approach is identical on every server zone. The one
  place a timezone is consulted is `today()`, which delegates to the
  Adelaide-anchored `todayISO()`. **Never call `new Date()` in hire logic.**
- Policy copy (the six terms entries) lives only in `src/lib/hire/config.ts`.
  The accordion and Doug's `hire_policy` tool both read it, so a wording change
  lands in both at once. Unconfirmed figures are flagged `// UNCONFIRMED` there.
- `select("*")` is banned on `reservations`. Column lists are explicit because
  Doug's tools run through the same read path, and customer names/phones/emails
  must never reach a conversation with a different customer.
- **The booking endpoint never reads a total from the client** — it doesn't even
  send one. `/api/hire/bookings` re-looks-up the equipment (published-only),
  re-checks the range through the engine, and re-prices with `quoteHire`. The
  browser supplies dates and contact details, nothing that costs money.
- Booking validation lives in `src/lib/hire/booking.ts` and is imported by
  *both* the form and the route, so the two can't disagree about what a valid
  mobile is. The browser's pass is for speed; the server's is the real one.
- A `23P01` from the insert is the expected outcome of two customers racing for
  the same dates, not a bug. Handle it as a 409 with a next step. Only `23505`
  (a reference collision) is worth retrying — retrying an overlap would be
  wrong, the dates really did go.


### DIY Hire admin console

- The booking lifecycle is a state machine in `src/lib/hire/workflow.ts`. The UI
  uses it to decide which buttons to show; `/api/admin/hire/reservations/[id]`
  uses it to decide what actually happens. The buttons are a suggestion — the
  route re-checks against the row's *current* status, because Thomas leaves
  tabs open.
- `declined` and `cancelled` are deliberately different: Thomas declines, the
  expiry sweep cancels. Keeping them apart lets the list tell "he said no" from
  "they never heard back in time" — different conversations to have.
- Status updates are guarded on the status that was checked
  (`.eq("status", previous)`), so two admins acting at once can't both win.
- **Removal rule:** equipment with any pending/confirmed/out reservation cannot
  be deleted — the route refuses with `canUnpublish: true` and the UI offers
  unpublishing instead. Anything else is *soft* deleted (`deleted_at`), never
  hard: `on delete restrict` would refuse anyway, and history has to survive.
- Admin reads use `ADMIN_RESERVATION_COLUMNS`, which includes customer detail.
  The PII-free `HOLD_COLUMNS` is what the public page and Doug use. Don't swap
  one for the other to save a query.
- **Hire SMS goes out after the write, never inside it** (`src/lib/hire/sms.ts`).
  A request texts Thomas; confirming texts the customer. Both dispatch through
  `after()` so the serverless instance survives the send — a bare floating
  promise gets dropped when the response closes. A Twilio outage must never
  cost a customer their booking or undo a confirmation.
- Declining deliberately sends **nothing**. A template can't explain why a
  request was refused, so that stays a phone call, and the decline dialog says
  so. Confirming is the only transition the customer hears about.
- SMS copy is written to fit **two GSM-7 segments**. One curly quote or en dash
  forces UCS-2 and cuts the segment size from 160 to 70 characters, tripling the
  cost invisibly. `forcesUnicode()` and the tests in `unit/hire-sms.spec.ts`
  hold that line — don't "tidy" the punctuation in those strings.
- `HIRE_NOTIFY_MOBILE` picks the recipient, mirroring `ENQUIRY_NOTIFY_EMAIL`.
  Unset, it falls back to the flyer number.

### Doug on the hire page

- **One bot, two modes.** The widget and `/api/enquiry` are shared with the
  marketing site; the browser sends `page` and the server picks the prompt
  (`dougSystemPrompt` in `src/lib/hire/doug.ts`). On `/hire` an appended
  section explicitly overrides the eleven-field intake — nobody hiring a mixer
  wants to be asked their postcode. Everywhere else the intake is untouched and
  gains only a short note that a hire desk exists. Both modes can switch to the
  other when the visitor clearly wants it. **Add to the persona, never replace
  it** — `dougSystemPrompt` takes the base prompt as an argument.
- **No figure reaches Doug except through a tool call.** The prompt contains no
  rate, bond, date or policy sentence, and `unit/hire-doug.spec.ts` fails the
  build if one appears — including in an innocent-looking format example. Tool
  results carry *pre-rendered strings* (`"$160"`, `"Fri, 7 Aug"`) rather than
  cents and day counts, because a model handed ingredients will do the
  arithmetic itself. That's the whole reason the formatters exist.
- **There is no `create_booking` tool, and there must never be one.** Doug can
  look things up and call `prefill_booking_form`, which fills the form in and
  scrolls to it. The customer still types their own details and presses the
  button, so every reservation goes through `/api/hire/bookings`, which
  re-prices and re-checks. The widget can't touch the page directly (shadow
  DOM), so the handoff travels as a `doug:hire-prefill` CustomEvent that
  `HireApp` listens for — and re-checks the range before accepting.
- `doug-tools.ts` reads only the PII-free path and published-only equipment.
  A conversation with one customer physically cannot surface another's details
  because the columns are never selected. Keep it that way.
- Tool failures return a *result Doug can read out*, never a thrown error — a
  mistyped slug should get a recovery, not "Doug's on smoko". `hire_policy` and
  the not-on-the-hire-page refusal both answer with the database down, since
  neither needs a row.

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
│   │   ├── cron/              # Vercel Cron (auth via CRON_SECRET)
│   │   └── enquiries/         # public contact form
│   ├── globals.css            # marketing-only CSS, ported from prototype
│   └── layout.tsx             # bare html/body + fonts + SW register
├── components/                # shared client + server components
├── lib/                       # business logic and helpers
│   └── hire/                  # DIY Hire availability engine (pure rules + repo)
├── types/                     # TypeScript declaration files
└── middleware.ts              # /admin and /worker route gating

unit/                          # pure-logic tests, no browser, no DB (npm run test:unit)
e2e/                           # Playwright end-to-end suite (npm run test:e2e)

supabase/
└── migrations/                # 0001..0033 — apply in order

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
