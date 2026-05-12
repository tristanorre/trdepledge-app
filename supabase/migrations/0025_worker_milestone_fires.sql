-- Migration: per-worker, per-week milestone dedupe table.
--
-- The "Super Darrell — 15 hours worked" weekly celebration push is the
-- first user of this table, but it's designed to scale — any future
-- milestone (Super Doug 20h, Team 100h, etc.) drops in by adding a row
-- to WEEKLY_MILESTONES in src/lib/milestones.ts and writing here on
-- fire.
--
-- The composite primary key is the dedupe contract: a milestone fires
-- at most once per (worker, ISO week, milestone). The INSERT inside
-- checkWeeklyMilestones() relies on a duplicate-key error to detect
-- "already fired this week — skip" without a round-trip read first.

set search_path = public;

create table if not exists public.worker_milestone_fires (
  worker_id     uuid        not null references public.users(id) on delete cascade,
  week_start    date        not null,            -- Monday of the ISO week
  milestone_key text        not null,            -- e.g. 'super_darrell_15h'
  fired_at      timestamptz not null default now(),
  primary key (worker_id, week_start, milestone_key)
);

-- Quick "did we fire X this week" lookups (rarely needed — the PK
-- collision is the hot path — but useful for debugging / audit pages).
create index if not exists worker_milestone_fires_key_week_idx
  on public.worker_milestone_fires (milestone_key, week_start desc);
