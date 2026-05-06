-- Atomic upsert + increment for the leave_balances counters.
--
-- Replaces a select-then-insert-or-update pattern in
-- /api/admin/leave/[id]/route.ts where two simultaneous admin
-- approvals could both read `current = X`, both write `X + days`, and
-- silently drop one approval's days. Today there's only one admin so
-- the race is theoretical, but the SQL is cheap and the bug class is
-- the kind that surfaces as "the numbers don't match" much later.
--
-- The function is column-name-driven (annual_used, sick_used,
-- personal_used) so we don't need three separate functions. The
-- column name is sanitised to an allowlist in plpgsql to keep the
-- dynamic SQL safe — no user input ever reaches the format() call.

set search_path = public;

create or replace function public.increment_leave_balance(
  p_worker_id uuid,
  p_year      int,
  p_column    text,            -- 'annual_used' | 'sick_used' | 'personal_used'
  p_days      int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_column not in ('annual_used', 'sick_used', 'personal_used') then
    raise exception 'p_column must be annual_used | sick_used | personal_used';
  end if;
  if p_days <= 0 then
    return;
  end if;

  -- ON CONFLICT (worker_id, year) requires a unique constraint on those
  -- two columns; the migration that defined leave_balances already
  -- declares it (0004_roster_and_leave.sql). The format() call only
  -- substitutes the column name we just allowlisted above.
  execute format($f$
    insert into public.leave_balances (worker_id, year, %1$I)
    values ($1, $2, $3)
    on conflict (worker_id, year) do update
      set %1$I = coalesce(public.leave_balances.%1$I, 0) + excluded.%1$I
  $f$, p_column)
  using p_worker_id, p_year, p_days;
end;
$$;

revoke all on function public.increment_leave_balance(uuid, int, text, int) from public;
grant execute on function public.increment_leave_balance(uuid, int, text, int) to service_role;
