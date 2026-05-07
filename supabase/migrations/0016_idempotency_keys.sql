-- Idempotency surfaces — proper unique-index dedup for webhooks + cron.
--
-- M9: Generic external-reference dedup for any future webhook source
-- that creates jobs. A dedicated, indexed `external_ref` column with a
-- partial unique index lets the webhook handler do
-- `INSERT … ON CONFLICT (external_ref) DO NOTHING` instead of grepping
-- `description` (which is a free-text field shown on invoices).
--
-- M19: cron jobs (shift-reminder, job-reminders) don't currently track
-- which days they've already run. A retry from Vercel after a flaky
-- run could send duplicate notifications. A `cron_runs` table keyed
-- on (job_name, run_date) gives us "already ran for today, skip" with
-- a single insert + ON CONFLICT.

-- ── M9: Jobs.external_ref
alter table public.jobs
  add column if not exists external_ref text;

-- Partial unique index — `external_ref` is null for normal jobs (most
-- of them), and a UNIQUE on a nullable column with multiple nulls is
-- only legal as a partial index in Postgres.
create unique index if not exists jobs_external_ref_uniq
  on public.jobs (external_ref)
  where external_ref is not null;

-- ── M19: Cron run tracking
create table if not exists public.cron_runs (
  job_name   text        not null,
  run_date   date        not null,
  ran_at     timestamptz not null default now(),
  detail     jsonb,
  primary key (job_name, run_date)
);

-- This table is service-role only. Cron handlers always run through
-- the service-role key; no admin/worker UI ever touches it.
alter table public.cron_runs enable row level security;
-- (no policies → no access for anon/authenticated; service_role
--  bypasses RLS as usual)
