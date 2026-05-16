-- Migration: per-day paid hours per worker.
--
-- Splits "hours paid to the worker" (this table) from "hours billed to
-- the client" (computed live from jobs.time_log via lib/cost.ts). The
-- two are independent on purpose:
--
--   * time_log = actual clock in/out + breaks, used to bill the client
--     accurately. A worker can't game payroll by clocking in early.
--
--   * worker_paid_hours = what Thomas decides to pay them for the day.
--     Set once via the roster editor (defaults to the rostered shift
--     length), but editable per-day on the payroll page so a rained-
--     out morning can be docked, or a quick extra job paid for,
--     without touching the operational time log.
--
-- Source field is for audit:
--   'manual'            — Thomas typed it on the payroll page
--   'roster'            — derived from the roster editor's daily hours
--   'auto_from_clock'   — future: pre-filled from clocked time (not yet)

set search_path = public;

create table if not exists public.worker_paid_hours (
  worker_id    uuid         not null references public.users(id) on delete cascade,
  work_date    date         not null,
  hours        numeric(5,2) not null check (hours >= 0 and hours <= 24),
  source       text         not null default 'manual'
    check (source in ('manual', 'roster', 'auto_from_clock')),
  updated_at   timestamptz  not null default now(),
  updated_by   uuid         references public.users(id) on delete set null,
  primary key (worker_id, work_date)
);

-- Looking up "everyone who got paid this week" is the dominant query
-- (payroll page + CSV export). Index by date for that, plus a partial
-- index for non-zero rows so the payroll roll-up is cheap.
create index if not exists worker_paid_hours_date_idx
  on public.worker_paid_hours (work_date);

create index if not exists worker_paid_hours_nonzero_idx
  on public.worker_paid_hours (work_date, worker_id) where hours > 0;

-- Bump updated_at on UPDATE so we have a clear "last touched" signal
-- without writing it from every caller.
create or replace function public.worker_paid_hours_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists worker_paid_hours_touch_trigger on public.worker_paid_hours;
create trigger worker_paid_hours_touch_trigger
  before update on public.worker_paid_hours
  for each row execute function public.worker_paid_hours_touch();
