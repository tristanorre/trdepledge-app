-- DIY Hire: equipment catalogue + reservations (customer hires AND Thomas's blocks).
-- Purely additive: touches none of the existing gardening/jobs tables.
--
-- NOTE ON PROVENANCE: this migration was applied directly to the project
-- (as `hire_equipment_and_reservations`) before it was written into the
-- repo. It is recorded here so a fresh environment can be built from
-- supabase/migrations alone. Every statement is idempotent, so re-running
-- it against the already-migrated project is a no-op.

create extension if not exists btree_gist with schema extensions;

do $$ begin
  create type reservation_kind as enum ('hire','block');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum
    ('pending','confirmed','out','returned','declined','cancelled','blocked');
exception when duplicate_object then null; end $$;

create table if not exists equipment (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  category        text not null,
  blurb           text,
  specs           text[] default '{}',
  daily_rate      numeric(10,2) not null check (daily_rate >= 0),
  bond            numeric(10,2) not null check (bond >= 0),
  photo_path      text,
  flyer_path      text,
  is_published    boolean not null default true,
  sort_order      int not null default 0,
  -- Per-item changeover gap. 0 = the next customer may collect the day
  -- after a return (the return day itself is already held by the
  -- inclusive daterange in `no_double_booking` below).
  -- Set to 1 to hold the following day too, without a code change.
  changeover_days int not null default 0 check (changeover_days >= 0),
  -- Soft delete, so history survives removal from the floor.
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists reservations (
  id             uuid primary key default gen_random_uuid(),
  equipment_id   uuid not null references equipment(id) on delete restrict,
  kind           reservation_kind not null,
  status         reservation_status not null,
  starts_on      date not null,
  ends_on        date not null,

  -- hire only
  reference      text unique,
  customer_name  text,
  customer_phone text,
  customer_email text,
  job_notes      text,
  charged_days   int,
  hire_total     numeric(10,2),
  bond_total     numeric(10,2),

  -- block only
  block_reason   text,

  created_at     timestamptz not null default now(),
  expires_at     timestamptz,

  constraint reservations_dates_ordered check (ends_on >= starts_on),
  constraint reservations_hire_fields   check (kind = 'block' or (reference is not null and customer_name is not null and customer_phone is not null)),
  constraint reservations_block_fields  check (kind = 'hire'  or block_reason is not null)
);

-- The important one. Nothing may overlap anything else holding dates,
-- including a customer booking over one of Thomas's own jobs.
--
-- The range is inclusive at BOTH ends, so a tool due back on the Tuesday
-- cannot be collected by someone else on that Tuesday. src/lib/hire
-- mirrors this exactly; the two must not drift.
do $$ begin
  alter table reservations add constraint no_double_booking
    exclude using gist (
      equipment_id with =,
      daterange(starts_on, ends_on, '[]') with &&
    ) where (status in ('pending','confirmed','out','blocked'));
exception when duplicate_table or duplicate_object then null; end $$;

create index if not exists reservations_equipment_dates_idx
  on reservations (equipment_id, starts_on, ends_on);
create index if not exists reservations_status_idx
  on reservations (status);
create index if not exists reservations_expiry_idx
  on reservations (expires_at) where status = 'pending';
