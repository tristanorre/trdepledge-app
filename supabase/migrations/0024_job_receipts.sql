-- Migration: per-job receipt photos.
--
-- Workers occasionally pay for materials on-site (e.g. Bunnings run
-- for extra mulch, hardware store for a spare hose fitting). Thomas
-- needs the receipt attached to the job so he can reconcile against
-- materials and claim GST. Previously workers texted Thomas a photo
-- of the receipt — that's both noisy and easy to lose.
--
-- Modelled identically to photos_before / photos_after: text[] of
-- Storage paths. The append_job_photo RPC is extended to accept
-- 'receipts' so the same upload route can write to it atomically.

set search_path = public;

-- ── 1. Column ───────────────────────────────────────────────────────
alter table public.jobs
  add column if not exists photos_receipts text[] not null default '{}'::text[];

-- ── 2. Extend the atomic-append RPC to support 'receipts' ───────────
-- Existing signature kept; only the `p_kind` allow-list and branch
-- table grow. Worker-scope check (assigned_worker_ids) is unchanged
-- so the same authz path covers receipts.
create or replace function public.append_job_photo(
  p_job_id    uuid,
  p_kind      text,           -- 'before' | 'after' | 'receipts'
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
  if p_kind not in ('before', 'after', 'receipts') then
    raise exception 'p_kind must be before, after, or receipts';
  end if;

  if p_kind = 'before' then
    update public.jobs
       set photos_before = array_append(coalesce(photos_before, '{}'::text[]), p_path)
     where id = p_job_id
       and coalesce(array_length(photos_before, 1), 0) < 50
       and (p_worker_id is null or assigned_worker_ids @> array[p_worker_id]);
  elsif p_kind = 'after' then
    update public.jobs
       set photos_after = array_append(coalesce(photos_after, '{}'::text[]), p_path)
     where id = p_job_id
       and coalesce(array_length(photos_after, 1), 0) < 50
       and (p_worker_id is null or assigned_worker_ids @> array[p_worker_id]);
  else
    -- 'receipts' — same 50-photo cap as the others.
    update public.jobs
       set photos_receipts = array_append(coalesce(photos_receipts, '{}'::text[]), p_path)
     where id = p_job_id
       and coalesce(array_length(photos_receipts, 1), 0) < 50
       and (p_worker_id is null or assigned_worker_ids @> array[p_worker_id]);
  end if;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.append_job_photo(uuid, text, text, uuid) from public;
grant execute on function public.append_job_photo(uuid, text, text, uuid) to service_role, authenticated;
