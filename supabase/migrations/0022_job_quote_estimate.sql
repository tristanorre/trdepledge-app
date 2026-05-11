-- Quote estimating on jobs.
--
-- When a job is in pending_review status, Thomas is preparing a quote.
-- He fills in an hours-per-worker estimate and a worker count, picks
-- materials from the catalogue, and sees a live total. When happy,
-- "Send Quote to Xero" pushes a draft Quote into Xero (using the
-- existing accounting.invoices scope, which covers Quotes per Xero's
-- granular-scope migration).
--
-- Columns added — all nullable; populated only for quoted jobs:
--   quote_hours_per_worker   numeric estimate of hours each worker spends
--   quote_worker_count       integer count of workers expected on site
--   xero_quote_id            the Xero quote QuoteID once sent
--   quote_sent_at            timestamp when the Xero push succeeded

alter table public.jobs
  add column if not exists quote_hours_per_worker numeric(5,2);

alter table public.jobs
  add column if not exists quote_worker_count integer;

alter table public.jobs
  add column if not exists xero_quote_id text;

alter table public.jobs
  add column if not exists quote_sent_at timestamptz;

-- Sanity constraints. Wrapped in DO so the bundle stays re-runnable
-- if these constraints already exist from a prior run.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_quote_hours_positive') then
    alter table public.jobs
      add constraint jobs_quote_hours_positive
      check (quote_hours_per_worker is null or quote_hours_per_worker > 0);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_quote_worker_count_positive') then
    alter table public.jobs
      add constraint jobs_quote_worker_count_positive
      check (quote_worker_count is null or quote_worker_count > 0);
  end if;
end $$;
