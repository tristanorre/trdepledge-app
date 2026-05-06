-- Migrate `jobs.time_log` from a single `{ start, end }` pair to a
-- per-worker keyed shape: `{ [worker_uuid]: { start, end } }`.
--
-- Why: the previous single-pair shape attributed the same hours to
-- every assigned worker on a multi-worker job. For payroll that
-- means if Bradley arrives at 9am and Aleisha at 11am to finish a
-- job that ends at 3pm, both rows in the payroll CSV said 6h
-- regardless. Real wages, real money, wrong number.
--
-- Backfill rule: for every job whose time_log has a top-level `start`
-- (the legacy shape), copy that single pair across every assigned
-- worker — this exactly preserves the current payroll output, so
-- nothing changes for already-completed jobs. Going forward, the
-- clock-in/out endpoint writes per-worker keys directly.
--
-- For jobs with no assigned workers OR no legacy `start`, leave
-- `time_log` as `{}`.
--
-- Idempotent — only triggers on rows that still match the legacy
-- shape (`time_log ? 'start'`).

update public.jobs
   set time_log = (
     select coalesce(
       jsonb_object_agg(
         wid::text,
         jsonb_strip_nulls(jsonb_build_object(
           'start', time_log->>'start',
           'end',   time_log->>'end'
         ))
       ),
       '{}'::jsonb
     )
     from unnest(assigned_worker_ids) as wid
   )
 where time_log ? 'start'
   and coalesce(array_length(assigned_worker_ids, 1), 0) > 0;

-- Edge case: a legacy row with `time_log = { start, end }` but no
-- workers (shouldn't happen in real data, but be safe). Reset to {}.
update public.jobs
   set time_log = '{}'::jsonb
 where time_log ? 'start'
   and coalesce(array_length(assigned_worker_ids, 1), 0) = 0;
