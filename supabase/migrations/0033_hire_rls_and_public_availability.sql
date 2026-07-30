-- DIY Hire: RLS + the only public route to availability data.
--
-- NOTE ON PROVENANCE: applied directly to the project (as
-- `hire_rls_and_public_availability`) before being written into the repo.
-- Recorded here so a fresh environment can be built from
-- supabase/migrations alone. Idempotent — safe to re-run.

alter table equipment    enable row level security;
alter table reservations enable row level security;

-- Public may read the catalogue: published, not soft-deleted. No PII lives here.
drop policy if exists equipment_public_read on equipment;
create policy equipment_public_read on equipment
  for select to anon, authenticated
  using (is_published and deleted_at is null);

-- reservations gets NO anon/authenticated policy on purpose.
-- Customer names, phones and emails are unreachable from the browser.
-- Server routes use the service role, which bypasses RLS.

-- Availability is exposed through this function and nothing else: dates only.
create or replace function public.hire_availability(
  p_slug text,
  p_from date,
  p_to   date
)
returns table (starts_on date, ends_on date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.starts_on, r.ends_on
  from reservations r
  join equipment e on e.id = r.equipment_id
  where e.slug = p_slug
    and e.is_published
    and e.deleted_at is null
    and r.status in ('pending','confirmed','out','blocked')
    and daterange(r.starts_on, r.ends_on, '[]') && daterange(p_from, p_to, '[]')
  order by r.starts_on;
$$;

revoke all on function public.hire_availability(text, date, date) from public;
grant execute on function public.hire_availability(text, date, date) to anon, authenticated, service_role;

-- Pending requests hold their dates, so they must not hold them forever.
-- One abandoned form would otherwise lock a tool permanently.
-- Called by src/lib/hire `releaseExpiredHolds()` before every booking
-- insert, and from the scheduled job.
create or replace function public.expire_pending_reservations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n integer;
begin
  update reservations
     set status = 'cancelled'
   where status = 'pending'
     and expires_at is not null
     and expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_pending_reservations() from public;
grant execute on function public.expire_pending_reservations() to service_role;
