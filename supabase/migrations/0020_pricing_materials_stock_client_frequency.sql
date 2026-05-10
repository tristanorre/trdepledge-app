-- Combined schema + config changes from the 11 May 2026 review:
--
--   1. Private client hourly rate: $60 → $55 inc-GST. The app stores
--      rates in integer cents; updating `private_rate_cents` in the
--      `config` table is enough — every CostBreakdown and Xero invoice
--      reads the live value via getRates().
--   2. materials_catalogue.quantity_on_hand — stock tracking for the
--      new /admin/materials page.
--   3. clients.service_frequency_days + clients.next_service_due —
--      lets Thomas flag a client as "weekly / fortnightly / monthly"
--      etc. so they show up in the schedule when due.

-- ── 1. Private rate $55 inc-GST = 5500 cents ────────────────────────
update public.config
   set value = '5500'
 where key   = 'private_rate_cents';

-- Insert if it doesn't exist yet (idempotent — covers a fresh DB).
insert into public.config (key, value)
values ('private_rate_cents', '5500')
on conflict (key) do nothing;

-- ── 2. Stock tracking on materials_catalogue ────────────────────────
alter table public.materials_catalogue
  add column if not exists quantity_on_hand numeric(10,2) not null default 0;

-- ── 3. Client service frequency ─────────────────────────────────────
alter table public.clients
  add column if not exists service_frequency_days integer;

alter table public.clients
  add column if not exists next_service_due date;

-- Sanity: frequency must be positive when set (e.g. 7=weekly, 14=fortnightly).
-- Wrapped in DO so the bundle stays re-runnable if the constraint
-- was already added on a prior run.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_service_frequency_days_positive'
  ) then
    alter table public.clients
      add constraint clients_service_frequency_days_positive
      check (service_frequency_days is null or service_frequency_days > 0);
  end if;
end $$;
