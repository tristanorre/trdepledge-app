-- Pin search_path on the three public.* trigger functions that lacked it.
--
-- WHY THIS EXISTS
--
-- Supabase's security advisor flagged eight functions with a mutable
-- search_path (`function_search_path_mutable`). A function without a pinned
-- search_path resolves its unqualified names against whatever the caller's
-- search_path happens to be at the time, so a schema the caller controls can
-- shadow `public` and get its own table or function called instead.
--
-- These three are the mild ones. They are SECURITY INVOKER triggers that run
-- as whoever fired them, and two of the three touch nothing but `new`. The
-- other five — the app.* authorisation helpers — are in 0042, and those are
-- the ones that mattered.
--
-- `create or replace` keeps the attached triggers attached: a trigger points
-- at the function by OID, and replace preserves it. All twelve triggers on
-- these three functions (2 on audit_log, 9 on set_updated_at, 1 on
-- worker_paid_hours) were verified still attached afterwards. Bodies are
-- unchanged from what was live — only the `set search_path` line is new.
--
-- `public, pg_temp` with pg_temp last, so a temp object can never shadow a
-- real one.
--
-- ALREADY APPLIED IN PRODUCTION — this file is a transcription of migration
-- `0041_pin_function_search_path` (applied 2026-09-07), written down so the
-- schema can be rebuilt from source. Re-running it is harmless.
--
-- NOTE ON THE NUMBER: there are two 0041s. `0041_hire_equipment_seed.sql`
-- was applied first (2026-08-31) and this one takes the same number because
-- that is the name recorded in supabase_migrations.schema_migrations, and a
-- filename that matches the recorded name is what makes drift visible. The
-- two are independent — neither depends on the other's effects.

create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_log is append-only — % is not permitted', tg_op;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.worker_paid_hours_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
