-- Slice 1: weekly roster + leave requests + leave balances.

create table if not exists public.roster (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),
  updated_at               timestamptz not null    default now(),

  worker_id                uuid        not null    references public.users(id) on delete cascade,
  week_start               date        not null,    -- Monday of the rostered week
  days                     text[]      not null    default '{}',  -- ['mon','tue',...]
  start_time               time,
  end_time                 time,

  unique (worker_id, week_start)
);

create index if not exists roster_week_idx on public.roster (week_start);

drop trigger if exists roster_set_updated_at on public.roster;
create trigger roster_set_updated_at
  before update on public.roster
  for each row execute function public.set_updated_at();


create table if not exists public.leave_requests (
  id                       uuid        primary key default gen_random_uuid(),
  worker_id                uuid        not null    references public.users(id) on delete cascade,

  type                     text        not null
    check (type in ('Annual Leave', 'Sick Leave', 'Personal Leave', 'Unpaid')),

  from_date                date        not null,
  to_date                  date        not null    check (to_date >= from_date),
  reason                   text,

  status                   text        not null    default 'pending'
    check (status in ('pending', 'approved', 'declined')),

  submitted_at             timestamptz not null    default now(),
  reviewed_at              timestamptz,
  reviewed_by              uuid        references public.users(id) on delete set null
);

create index if not exists leave_requests_worker_status_idx
  on public.leave_requests (worker_id, status);
create index if not exists leave_requests_pending_idx
  on public.leave_requests (status) where status = 'pending';


-- Per-worker leave entitlement, one row per (worker, year). Defaults
-- match the spec: 20 annual / 10 sick / 2 personal days.
create table if not exists public.leave_balances (
  id                       uuid        primary key default gen_random_uuid(),
  worker_id                uuid        not null    references public.users(id) on delete cascade,
  year                     integer     not null,

  annual_total             numeric(5,2) not null   default 20,
  annual_used              numeric(5,2) not null   default 0,
  sick_total               numeric(5,2) not null   default 10,
  sick_used                numeric(5,2) not null   default 0,
  personal_total           numeric(5,2) not null   default 2,
  personal_used            numeric(5,2) not null   default 0,

  unique (worker_id, year)
);
