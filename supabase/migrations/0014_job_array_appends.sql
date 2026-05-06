-- Atomic array-append RPCs for the `jobs` table — fixes a read-modify-write
-- race on `photos_before`, `photos_after`, and `notes`.
--
-- The old pattern in /api/jobs/[id]/photos and /api/.../notes was:
--   1. select photos_before from jobs where id = ?
--   2. const next = [...row.photos_before, newPath]
--   3. update jobs set photos_before = $next where id = ?
-- Two simultaneous uploads on a job (admin + worker, or two workers
-- on a phone with iffy signal retrying) would each read the same
-- starting array, append, and overwrite the other's append. Net
-- result: orphan blobs in storage with no DB reference.
--
-- Postgres `array_append` (text[]) and `||` (jsonb) are atomic under
-- a single UPDATE statement, so doing the append in SQL closes the
-- race entirely.
--
-- Authorisation is included in the function so the call site stays a
-- single round-trip:
--   * Admin path: pass NULL as p_worker_id → no scope filter
--   * Worker path: pass the worker's user id → `assigned_worker_ids`
--     must contain that id, otherwise the UPDATE matches zero rows
--     and the RPC returns false (treat as 404 client-side).
--
-- Caps:
--   * notes:      200 entries — well past anything realistic for a
--                 single job's lifetime; just stops a runaway loop
--                 from inflating one row to MB scale.
--   * photos_*:    50 entries per kind — same reasoning.
-- The functions silently no-op on cap breach (return false). The
-- caller can decide whether to surface that as an error.

set search_path = public;

create or replace function public.append_job_photo(
  p_job_id    uuid,
  p_kind      text,           -- 'before' | 'after'
  p_path      text,
  p_worker_id uuid             -- null for admin
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  if p_kind not in ('before', 'after') then
    raise exception 'p_kind must be before or after';
  end if;

  if p_kind = 'before' then
    update public.jobs
       set photos_before = array_append(coalesce(photos_before, '{}'::text[]), p_path)
     where id = p_job_id
       and coalesce(array_length(photos_before, 1), 0) < 50
       and (p_worker_id is null or assigned_worker_ids @> array[p_worker_id]);
  else
    update public.jobs
       set photos_after = array_append(coalesce(photos_after, '{}'::text[]), p_path)
     where id = p_job_id
       and coalesce(array_length(photos_after, 1), 0) < 50
       and (p_worker_id is null or assigned_worker_ids @> array[p_worker_id]);
  end if;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.append_job_note(
  p_job_id    uuid,
  p_note      jsonb,            -- { author_id, author_name, text, timestamp }
  p_worker_id uuid               -- null for admin
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int;
begin
  update public.jobs
     set notes = coalesce(notes, '[]'::jsonb) || jsonb_build_array(p_note)
   where id = p_job_id
     and jsonb_array_length(coalesce(notes, '[]'::jsonb)) < 200
     and (p_worker_id is null or assigned_worker_ids @> array[p_worker_id]);

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

-- Lock execution to the service role + authenticated. Public would let
-- the anon role call them, which we never want.
revoke all on function public.append_job_photo(uuid, text, text, uuid) from public;
revoke all on function public.append_job_note(uuid, jsonb, uuid) from public;
grant execute on function public.append_job_photo(uuid, text, text, uuid) to service_role, authenticated;
grant execute on function public.append_job_note(uuid, jsonb, uuid) to service_role, authenticated;
