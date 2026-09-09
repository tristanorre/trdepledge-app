-- Pin search_path on the five app.* helper functions.
--
-- WHY THIS EXISTS
--
-- These matter more than the public.* triggers in 0041 did. They are the
-- authorisation primitives — `is_admin`, `current_user_id`, and the storage
-- policy predicate `can_access_job_photo` — so a caller-controlled
-- search_path that resolved `public.jobs` or `app.is_admin` to something
-- else would be an authorisation bypass, not a nuisance. `job_photos_read`
-- on storage.objects is defined as
-- `bucket_id = 'job-photos' and app.can_access_job_photo(name)`, which is
-- the whole of who may read a job photo.
--
-- search_path is `app, public, pg_temp` because can_access_job_photo
-- references both schemas: app.is_admin / app.current_user_id and
-- public.jobs. pg_temp last so a temp object can never shadow a real one.
--
-- Bodies are transcribed from pg_get_functiondef against the live database,
-- not reconstructed. Only the `set search_path` line is new. `current_role`
-- stays double-quoted: it is a reserved word and the quoting is load-bearing.
--
-- THE SCHEMA GUARD IS THE ONE ADDITION. Everything else here is a
-- transcription, but `create schema if not exists app` is not in the applied
-- migration — it is here because the `app` schema and these five functions
-- were never in `supabase/migrations/` at all. They existed only in the live
-- database, the same drift that emptied the hire yard in 0041. Without the
-- guard this file fails on a fresh rebuild with "schema app does not exist";
-- against production it is a no-op, since the schema is already there and
-- owned by postgres.
--
-- THE CALLERS ARE IN 0043. The three `job-photos` policies on
-- storage.objects (job_photos_read, job_photos_insert, job_photos_delete)
-- call these functions and were missing from the migrations for the same
-- reason. Read 0043's header before trusting them: all three are currently
-- inert, because the roles they apply to have no USAGE on this schema.
--
-- ALREADY APPLIED IN PRODUCTION — this file is a transcription of migration
-- `0042_pin_app_function_search_path` (applied 2026-09-07), written down so
-- the schema can be rebuilt from source. Re-running it is harmless.
--
-- No grants are issued here, matching production: the schema has default
-- privileges (owner only), so nothing is being widened by writing it down.

create schema if not exists app;

create or replace function app.current_user_id()
returns uuid
language sql
stable
set search_path = app, public, pg_temp
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

create or replace function app."current_role"()
returns text
language sql
stable
set search_path = app, public, pg_temp
as $function$
  select coalesce(current_setting('request.jwt.claim.role', true), '')
$function$;

create or replace function app.is_admin()
returns boolean
language sql
stable
set search_path = app, public, pg_temp
as $function$
  select app.current_role() = 'admin'
$function$;

create or replace function app.block_audit_mutation()
returns trigger
language plpgsql
set search_path = app, public, pg_temp
as $function$
begin
  raise exception 'audit_log is immutable: % not permitted', tg_op;
end $function$;

create or replace function app.can_access_job_photo(object_name text)
returns boolean
language sql
stable
set search_path = app, public, pg_temp
as $function$
  select case
    when object_name is null then false
    when app.is_admin() then true
    else exists (
      select 1 from public.jobs j
      where j.id = (split_part(object_name, '/', 1))::uuid
        and app.current_user_id() = any (j.assigned_worker_ids)
    )
  end
$function$;
