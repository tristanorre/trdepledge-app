-- Daily timesheet flow (worker-submitted + admin-approved).
--
-- One row per (worker_id, work_date). Three lifecycle states:
--
--   1. DRAFT       — row exists, submitted_at is null. Worker is
--                    still editing.
--   2. AUTHORISED  — submitted_at is set. Worker has signed off;
--                    awaiting admin review.
--   3. APPROVED    — approved_at is set. Admin has approved; the
--                    row is what feeds payroll (Xero CSV export
--                    today; direct Xero Payroll push once that's
--                    wired up next).
--
-- The distinction from `worker_paid_hours` is intentional:
--   * worker_paid_hours = the FINAL number that gets paid (also
--     written to this table on admin approval, for backward compat
--     with the existing CSV export)
--   * daily_timesheets  = the FULL audit trail — what the worker
--     said, what the admin changed it to, when, and why (notes).
--
-- Entry types cover both worked days AND leave/off days. Leave
-- entries let workers record sick or same-day leave without needing
-- a formal leave_request. When admin approves a leave-type entry,
-- the matching counter on leave_balances gets incremented via the
-- existing increment_leave_balance RPC.

create table if not exists public.daily_timesheets (
  id                    uuid        primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  worker_id             uuid        not null references public.users(id) on delete cascade,
  work_date             date        not null,

  -- ── Worker's own entry ──────────────────────────────────
  entry_type            text        not null default 'worked'
    check (entry_type in (
      'worked', 'annual_leave', 'sick_leave', 'personal_leave',
      'unpaid_leave', 'public_holiday', 'day_off'
    )),
  hours                 numeric(5,2) not null default 0
    check (hours >= 0 and hours <= 24),
  worker_note           text,
  submitted_at          timestamptz,  -- set = worker has authorised

  -- ── Admin's approval / adjustment ───────────────────────
  approved_entry_type   text
    check (approved_entry_type is null or approved_entry_type in (
      'worked', 'annual_leave', 'sick_leave', 'personal_leave',
      'unpaid_leave', 'public_holiday', 'day_off'
    )),
  approved_hours        numeric(5,2)
    check (approved_hours is null or (approved_hours >= 0 and approved_hours <= 24)),
  admin_note            text,
  approved_at           timestamptz,
  approved_by           uuid        references public.users(id) on delete set null,

  -- ── Optional cross-ref to an approved leave_request ─────
  -- Populated by the admin UI when the day falls inside an approved
  -- leave_request so we can trace the audit trail both ways.
  leave_request_id      uuid        references public.leave_requests(id) on delete set null,

  -- ── Xero payroll push state ─────────────────────────────
  -- pushed_to_xero_at is set when the approved row was successfully
  -- included in a Xero Payroll payload. Existing CSV export doesn't
  -- update this — it's for the future direct-to-Payroll flow.
  pushed_to_xero_at     timestamptz,
  xero_timesheet_line_id text,       -- returned by Xero, for update / dedup

  unique (worker_id, work_date)
);

create index if not exists daily_timesheets_worker_date_idx
  on public.daily_timesheets (worker_id, work_date desc);

create index if not exists daily_timesheets_week_idx
  on public.daily_timesheets (work_date);

-- Fast lookup of "everything approved but not yet pushed to Xero"
-- for the future direct-push cron.
create index if not exists daily_timesheets_approved_unpushed_idx
  on public.daily_timesheets (approved_at)
  where approved_at is not null and pushed_to_xero_at is null;

drop trigger if exists daily_timesheets_set_updated_at on public.daily_timesheets;
create trigger daily_timesheets_set_updated_at
  before update on public.daily_timesheets
  for each row execute function public.set_updated_at();
