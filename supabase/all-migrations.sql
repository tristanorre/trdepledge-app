-- ============================================================
-- T.R. Depledge — full schema, paste this into Supabase SQL editor.
-- Generated 2026-05-07T22:30:36Z by scripts/build-all-migrations.sh
-- Idempotent: safe to re-run on a fresh project.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 0001_enquiries.sql
-- ────────────────────────────────────────────────────────────
-- Slice 2: enquiries table backing the public website's contact form.
-- Future slices will add the rest of the schema (jobs, users, roster,
-- audit_log, etc.) and wire RLS policies for admin/worker roles.

create table if not exists public.enquiries (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null    default now(),
  first_name      text        not null,
  last_name       text        not null,
  email           text        not null,
  phone           text,
  suburb          text        not null,
  service_type    text        not null,
  client_type     text,
  message         text,

  -- SMS auto-reply tracking (wired in Slice 7).
  sms_sent        boolean     not null    default false,
  sms_sent_at     timestamptz,

  status          text        not null    default 'new'
    check (status in ('new', 'contacted', 'converted', 'closed')),

  -- Set when admin converts an enquiry into a job.
  converted_to_job_id uuid,

  notes           text
);

create index if not exists enquiries_status_created_idx
  on public.enquiries (status, created_at desc);

create index if not exists enquiries_email_idx
  on public.enquiries (email);

-- Lock the table down. The website API uses the service-role key to write,
-- so we don't need any anon-role policies. Admin SELECT/UPDATE will be
-- granted in Slice 1 (auth + RLS) once the users + role infra is in place.
alter table public.enquiries enable row level security;

-- Helpful trigger: auto-set updated_at if/when we add it later. Not needed
-- yet — kept as a comment so Slice 1 picks it up:
-- create trigger enquiries_set_updated_at before update on public.enquiries
--   for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 0002_users.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1: users table for NextAuth credentials provider.
--
-- Auth flow context:
--   - All DB access runs through the server with the service-role key.
--   - NextAuth handles session/JWT minting; the DB just stores hashed
--     credentials and looks them up by email (admin) or by id (worker PIN).
--   - Workers authenticate by selecting their name from a list and entering
--     a 4-digit PIN. The PIN alone isn't unique — selection narrows to one
--     user, then bcrypt verifies the PIN.
--   - Admin authenticates by email + password. Spec listed only `pin_hash`
--     but admin needs a password_hash too; both are nullable since each
--     role uses one but not both.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),
  updated_at               timestamptz not null    default now(),

  name                     text        not null,
  email                    text        unique,
  role                     text        not null    check (role in ('admin', 'worker')),

  -- One of these is populated depending on role.
  password_hash            text,        -- bcrypt; admin login only
  pin_hash                 text,        -- bcrypt; worker login only

  colour                   text        not null    default '#A8D818',
  phone                    text,

  police_check_complete    boolean     not null    default false,
  police_check_date        date,
  employment_start_date    date,

  notes                    text,
  onesignal_player_id      text,

  active                   boolean     not null    default true
);

create index if not exists users_role_active_idx on public.users (role, active);

-- Keep updated_at honest.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 0003_clients_and_jobs.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1: clients + jobs + per-job materials.
--
-- Money is stored as integers (cents) per spec — never floats. Display
-- formatting happens in the app.

create table if not exists public.clients (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),
  updated_at               timestamptz not null    default now(),

  name                     text        not null,
  type                     text        not null
    check (type in ('Private', 'NDIS', 'Aged Care', 'Commercial')),

  address                  text,
  suburb                   text,
  postcode                 text,
  phone                    text,
  email                    text,

  -- NDIS-specific. Nullable for non-NDIS clients.
  ndis_participant_number  text,
  plan_manager_name        text,
  plan_manager_email       text,
  plan_manager_phone       text,
  ndis_funding_type        text
    check (ndis_funding_type in ('self', 'plan', 'agency') or ndis_funding_type is null),

  xero_contact_id          text,
  notes                    text
);

create index if not exists clients_type_idx on public.clients (type);

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();


create table if not exists public.jobs (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),
  updated_at               timestamptz not null    default now(),

  client_id                uuid        references public.clients(id) on delete set null,
  -- Denormalised snapshot of client name/type at time of booking, so
  -- historical jobs survive client edits or deletions.
  client_name              text        not null,
  client_type              text        not null
    check (client_type in ('Private', 'NDIS', 'Aged Care')),

  address                  text,
  suburb                   text,
  postcode                 text,

  date                     date,
  scheduled_time           time,

  description              text,

  status                   text        not null    default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled', 'pending_review')),

  assigned_worker_ids      uuid[]      not null    default '{}'::uuid[],
  waiting_time_minutes     integer     not null    default 0
    check (waiting_time_minutes >= 0),

  -- Free-form structured data. App is responsible for shape.
  notes                    jsonb       not null    default '[]'::jsonb,
  materials_used           jsonb       not null    default '[]'::jsonb,
  photos_before            text[]      not null    default '{}',
  photos_after             text[]      not null    default '{}',
  time_log                 jsonb       not null    default '{}'::jsonb,

  invoice_sent             boolean     not null    default false,
  xero_invoice_id          text
);

create index if not exists jobs_date_status_idx on public.jobs (date, status);
create index if not exists jobs_client_idx on public.jobs (client_id);
create index if not exists jobs_assigned_workers_idx on public.jobs using gin (assigned_worker_ids);

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();


-- Per-job materials line items. Lives alongside jobs.materials_used jsonb
-- for normalised reporting (per-material usage across jobs, etc.).
create table if not exists public.job_materials (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),
  job_id                   uuid        not null    references public.jobs(id) on delete cascade,
  material_id              uuid        not null,    -- FK declared in 0006 once materials_catalogue exists
  qty                      numeric(10,3) not null  check (qty > 0),
  markup_percent           integer     not null    default 20  check (markup_percent >= 0)
);

create index if not exists job_materials_job_idx on public.job_materials (job_id);

-- ────────────────────────────────────────────────────────────
-- 0004_roster_and_leave.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1: weekly roster + leave requests + leave balances.

create table if not exists public.roster (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),
  updated_at               timestamptz not null    default now(),

  worker_id                uuid        not null    references public.users(id) on delete cascade,
  week_start               date        not null,    -- Monday of the rostered week
  days                     text[]      not null    default '{}',  -- ['mon','tue',...]
  start_time               time,
  end_time                 time,

  unique (worker_id, week_start)
);

create index if not exists roster_week_idx on public.roster (week_start);

drop trigger if exists roster_set_updated_at on public.roster;
create trigger roster_set_updated_at
  before update on public.roster
  for each row execute function public.set_updated_at();


create table if not exists public.leave_requests (
  id                       uuid        primary key default gen_random_uuid(),
  worker_id                uuid        not null    references public.users(id) on delete cascade,

  type                     text        not null
    check (type in ('Annual Leave', 'Sick Leave', 'Personal Leave', 'Unpaid')),

  from_date                date        not null,
  to_date                  date        not null    check (to_date >= from_date),
  reason                   text,

  status                   text        not null    default 'pending'
    check (status in ('pending', 'approved', 'declined')),

  submitted_at             timestamptz not null    default now(),
  reviewed_at              timestamptz,
  reviewed_by              uuid        references public.users(id) on delete set null
);

create index if not exists leave_requests_worker_status_idx
  on public.leave_requests (worker_id, status);
create index if not exists leave_requests_pending_idx
  on public.leave_requests (status) where status = 'pending';


-- Per-worker leave entitlement, one row per (worker, year). Defaults
-- match the spec: 20 annual / 10 sick / 2 personal days.
create table if not exists public.leave_balances (
  id                       uuid        primary key default gen_random_uuid(),
  worker_id                uuid        not null    references public.users(id) on delete cascade,
  year                     integer     not null,

  annual_total             numeric(5,2) not null   default 20,
  annual_used              numeric(5,2) not null   default 0,
  sick_total               numeric(5,2) not null   default 10,
  sick_used                numeric(5,2) not null   default 0,
  personal_total           numeric(5,2) not null   default 2,
  personal_used            numeric(5,2) not null   default 0,

  unique (worker_id, year)
);

-- ────────────────────────────────────────────────────────────
-- 0005_assets_and_audit_log.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1: inventory assets + immutable audit log.
--
-- The audit log is **truly append-only**. Per spec, no UPDATE or DELETE may
-- ever touch the table — including when called via the service role key.
-- We enforce this with a BEFORE UPDATE/DELETE trigger that raises an
-- exception (triggers cannot be bypassed by the service role) plus an
-- explicit privilege revoke as belt-and-braces.

create table if not exists public.assets (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),
  updated_at               timestamptz not null    default now(),

  name                     text        not null,
  identifier               text,         -- e.g. "Ute #1", "S123ABC"
  category                 text        not null
    check (category in ('Vehicles', 'Power Equipment', 'Hand Tools', 'Safety & PPE', 'Materials Stock')),

  icon                     text,         -- emoji or icon key chosen by Thomas
  condition                text        not null    default 'Good'
    check (condition in ('Good', 'Needs Service', 'Damaged', 'In Stock', 'Out of Stock')),

  assigned_to              uuid        references public.users(id) on delete set null,
  notes                    text
);

create index if not exists assets_category_idx on public.assets (category);
create index if not exists assets_assigned_to_idx on public.assets (assigned_to);

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
  before update on public.assets
  for each row execute function public.set_updated_at();


-- ── AUDIT LOG ────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id                       uuid        primary key default gen_random_uuid(),
  "timestamp"              timestamptz not null    default now(),

  action                   text        not null,    -- e.g. 'asset.assigned', 'asset.condition_changed'
  item_id                  uuid,
  item_name                text        not null,

  from_worker_id           uuid        references public.users(id) on delete set null,
  to_worker_id             uuid        references public.users(id) on delete set null,
  performed_by             uuid        references public.users(id) on delete set null,

  note                     text
);

create index if not exists audit_log_timestamp_idx on public.audit_log ("timestamp" desc);
create index if not exists audit_log_action_idx on public.audit_log (action, "timestamp" desc);

-- Immutability — triggers fire even for the service role.
create or replace function public.audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only — % is not permitted', tg_op;
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_immutable();

drop trigger if exists audit_log_no_delete on public.audit_log;
create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_immutable();

-- Belt and braces: drop UPDATE/DELETE privileges from every role.
revoke update, delete, truncate on public.audit_log from public;
revoke update, delete, truncate on public.audit_log from anon;
revoke update, delete, truncate on public.audit_log from authenticated;
revoke update, delete, truncate on public.audit_log from service_role;

-- ────────────────────────────────────────────────────────────
-- 0006_materials_and_config.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1: materials catalogue + key/value config.

create table if not exists public.materials_catalogue (
  id                       uuid        primary key default gen_random_uuid(),
  created_at               timestamptz not null    default now(),

  name                     text        not null,
  unit                     text        not null,    -- e.g. 'm²', 'kg', 'each', 'L', 'bag'
  base_price_cents         integer     not null    check (base_price_cents >= 0),
  category                 text,
  active                   boolean     not null    default true
);

create index if not exists materials_catalogue_active_idx on public.materials_catalogue (active);

-- Now that materials_catalogue exists, add the deferred FK from job_materials.
alter table public.job_materials
  drop constraint if exists job_materials_material_id_fkey;
alter table public.job_materials
  add constraint job_materials_material_id_fkey
  foreign key (material_id) references public.materials_catalogue(id);


create table if not exists public.config (
  key                      text        primary key,
  value                    text        not null,
  updated_at               timestamptz not null    default now()
);

drop trigger if exists config_set_updated_at on public.config;
create trigger config_set_updated_at
  before update on public.config
  for each row execute function public.set_updated_at();

-- Seed values per spec. Rates in cents; admin can edit via Settings later.
insert into public.config (key, value) values
  ('private_rate_cents',         '6000'),
  ('ndis_rate_cents',            '5698'),
  ('aged_care_rate_cents',       '5698'),
  ('default_markup_percent',     '20'),
  ('ndis_support_item',          '01_019_0120_1_1'),
  ('cancellation_notice_days',   '7')
on conflict (key) do nothing;

-- ────────────────────────────────────────────────────────────
-- 0007_notifications_sms_xero.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1: notification log, SMS log, Xero token storage.

create table if not exists public.notifications (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null    references public.users(id) on delete cascade,
  title                    text        not null,
  message                  text        not null,
  deep_link                text,
  read                     boolean     not null    default false,
  sent_at                  timestamptz not null    default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read, sent_at desc);


create table if not exists public.sms_log (
  id                       uuid        primary key default gen_random_uuid(),
  "timestamp"              timestamptz not null    default now(),

  recipient_name           text,
  recipient_number         text        not null,
  message                  text        not null,

  trigger_type             text        not null
    check (trigger_type in ('auto', 'manual')),

  job_id                   uuid        references public.jobs(id) on delete set null,
  client_id                uuid        references public.clients(id) on delete set null,

  delivery_status          text,
  twilio_message_sid       text
);

create index if not exists sms_log_timestamp_idx on public.sms_log ("timestamp" desc);


-- One row per admin user. Slice 1 only ever has Thomas, but the schema
-- supports multiple admins for forward compatibility.
create table if not exists public.xero_tokens (
  user_id                  uuid        primary key references public.users(id) on delete cascade,
  access_token             text        not null,
  refresh_token            text        not null,
  tenant_id                text        not null,
  expires_at               timestamptz not null,
  updated_at               timestamptz not null    default now()
);

drop trigger if exists xero_tokens_set_updated_at on public.xero_tokens;
create trigger xero_tokens_set_updated_at
  before update on public.xero_tokens
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- 0008_rls_policies.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1: Row Level Security.
--
-- ARCHITECTURE NOTE
-- =================
-- We use NextAuth (not Supabase Auth) for sessions. All DB access happens
-- on the server through the service-role key. The service role bypasses
-- RLS by default. Therefore RLS here serves two purposes:
--
--   1. Hard-block all anonymous and authenticated-public access. The
--      Supabase anon key (used by `@supabase/supabase-js` from a browser)
--      must not be able to read or write any business table.
--   2. Document the intended per-role access policy from the spec, which
--      the application layer enforces in its API routes.
--
-- The audit_log immutability requirement is enforced separately via
-- triggers (see 0005), because the service role *can* bypass RLS but
-- *cannot* bypass triggers.

-- ── Restore Supabase default grants ─────────────────────────────────
-- If the public schema was dropped + recreated (a common reset path),
-- the default grants Supabase relies on for service_role / anon /
-- authenticated get wiped along with the old tables. Re-establish them
-- before flipping RLS on, otherwise our service-role API routes get
-- "permission denied for table X" errors.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- Enable RLS on every business table.
alter table public.enquiries           enable row level security;
alter table public.users               enable row level security;
alter table public.clients             enable row level security;
alter table public.jobs                enable row level security;
alter table public.job_materials       enable row level security;
alter table public.roster              enable row level security;
alter table public.leave_requests      enable row level security;
alter table public.leave_balances      enable row level security;
alter table public.assets              enable row level security;
alter table public.audit_log           enable row level security;
alter table public.materials_catalogue enable row level security;
alter table public.config              enable row level security;
alter table public.notifications       enable row level security;
alter table public.sms_log             enable row level security;
alter table public.xero_tokens         enable row level security;

-- No policies are created for anon or authenticated. With RLS enabled
-- and no permissive policies, both roles are effectively denied across
-- the board. The service-role bypass means our API routes work fine.
--
-- Future Supabase-Auth-based access (e.g. if we move workers to magic-link
-- login later) would add policies referencing auth.uid() per the spec.

-- Defensive: also revoke direct table privileges from anon so even an
-- accidental policy slip can't expose data.
revoke all on public.enquiries           from anon;
revoke all on public.users               from anon;
revoke all on public.clients             from anon;
revoke all on public.jobs                from anon;
revoke all on public.job_materials       from anon;
revoke all on public.roster              from anon;
revoke all on public.leave_requests      from anon;
revoke all on public.leave_balances      from anon;
revoke all on public.assets              from anon;
revoke all on public.audit_log           from anon;
revoke all on public.materials_catalogue from anon;
revoke all on public.config              from anon;
revoke all on public.notifications       from anon;
revoke all on public.sms_log             from anon;
revoke all on public.xero_tokens         from anon;

-- ────────────────────────────────────────────────────────────
-- 0009_seed_users_and_inventory.sql
-- ────────────────────────────────────────────────────────────
-- Slice 1 seed: 1 admin (Thomas), 4 named workers, assets, materials.
--
-- TEMPORARY PASSWORDS — change these on first login!
--   Thomas (admin):  email t.rdepledge@outlook.com  password 'ChangeMe!2025'
--   Workers (PIN):   PIN '1234' for all four pre-seeded workers
--
-- Both are bcrypt-hashed via pgcrypto's crypt(..., gen_salt('bf', 10)),
-- which produces a $2a$10$... hash compatible with bcryptjs.compare()
-- in the NextAuth credentials provider.
--
-- The 3 empty worker slots from the spec are NOT pre-created — Thomas
-- adds those via the admin panel when he hires.

create extension if not exists pgcrypto;

-- ── USERS ────────────────────────────────────────────────────────────
insert into public.users (name, email, role, password_hash, colour, phone, active)
values (
  'Thomas Depledge',
  't.rdepledge@outlook.com',
  'admin',
  crypt('ChangeMe!2025', gen_salt('bf', 10)),
  '#A8D818',
  '0474 844 204',
  true
)
on conflict (email) do nothing;

insert into public.users (name, role, pin_hash, colour, active) values
  ('Bradley Depledge',     'worker', crypt('1234', gen_salt('bf', 10)), '#1A4FB5', true),
  ('Aleisha Bussenschutt', 'worker', crypt('1234', gen_salt('bf', 10)), '#FFE500', true),
  ('Darrell Woods',        'worker', crypt('1234', gen_salt('bf', 10)), '#7AAB0F', true),
  ('Dave Kay',             'worker', crypt('1234', gen_salt('bf', 10)), '#DC2626', true);

-- Initial leave balances for the four pre-seeded workers, current year.
insert into public.leave_balances (worker_id, year)
select id, extract(year from now())::int
from public.users
where role = 'worker'
on conflict (worker_id, year) do nothing;


-- ── MATERIALS CATALOGUE ──────────────────────────────────────────────
insert into public.materials_catalogue (name, unit, base_price_cents, category) values
  ('Lawn Turf',       'm²',   1200, 'Lawn'),
  ('Lawn Seed',       'kg',    800, 'Lawn'),
  ('Gravel 10mm',     'm²',   2500, 'Hardscape'),
  ('Mulch',           'm²',   1800, 'Garden'),
  ('Garden Soil',     'bag',  1200, 'Garden'),
  ('Herbicide Spray', 'L',    2200, 'Chemical'),
  ('Fertiliser',      'kg',   1500, 'Garden'),
  ('Shrub Small',     'each', 1800, 'Plants'),
  ('Shrub Large',     'each', 4500, 'Plants'),
  ('Native Plant',    'each', 1200, 'Plants'),
  ('Tree Small',      'each', 8500, 'Plants'),
  ('Potting Mix',     'bag',  1400, 'Garden')
on conflict do nothing;


-- ── ASSETS ───────────────────────────────────────────────────────────
-- Vehicles
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('White Hilux Ute',     'Ute #1 · S123ABC', 'Vehicles', '🚙', 'Good', null),
  ('TR Depledge Trailer', 'Trailer #1',       'Vehicles', '🚛', 'Good', null);

-- Power Equipment
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('Ride-On Mower',     'Husqvarna Z254 · #001', 'Power Equipment', '🚜', 'Good',         null),
  ('Push Mower',        'Honda HRX · #002',      'Power Equipment', '🌱', 'Good',         null),
  ('Whipper Snipper #1','Husqvarna · #003',      'Power Equipment', '✂️', 'Good',         null),
  ('Whipper Snipper #2','Stihl · #004',          'Power Equipment', '✂️', 'Needs Service','Due for service'),
  ('Hedge Trimmer',     'Stihl HS45 · #005',     'Power Equipment', '🌳', 'Good',         null),
  ('Chainsaw',          'Stihl MS170 · #006',    'Power Equipment', '🪚', 'Good',         'Authorised users only'),
  ('Leaf Blower',       'Stihl BG86 · #007',     'Power Equipment', '🍂', 'Good',         null);

-- Hand Tools
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('Shovel Set x3',  'Tools #010', 'Hand Tools', '🛠️', 'Good', null),
  ('Rake Set x3',    'Tools #011', 'Hand Tools', '🛠️', 'Good', null),
  ('Wheelbarrow #1', 'WB #001',    'Hand Tools', '🛒', 'Good', null),
  ('Wheelbarrow #2', 'WB #002',    'Hand Tools', '🛒', 'Good', null);

-- Safety & PPE — one kit per worker, assigned by name.
insert into public.assets (name, identifier, category, icon, condition, assigned_to) values
  ('Safety Kit — Bradley Depledge',     null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Bradley Depledge')),
  ('Safety Kit — Aleisha Bussenschutt', null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Aleisha Bussenschutt')),
  ('Safety Kit — Darrell Woods',        null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Darrell Woods')),
  ('Safety Kit — Dave Kay',             null, 'Safety & PPE', '🦺', 'Good',
   (select id from public.users where name = 'Dave Kay'));

insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('First Aid Kit', 'FAK #001', 'Safety & PPE', '⛑️', 'Good', 'Expires June 2026');

-- Materials Stock (current inventory levels, not the catalogue)
insert into public.assets (name, identifier, category, icon, condition, notes) values
  ('Herbicide Spray', null, 'Materials Stock', '🧴', 'In Stock', '12L remaining'),
  ('Fertiliser Bags', null, 'Materials Stock', '🌾', 'In Stock', '8 × 25kg bags'),
  ('Mulch (bulk)',    null, 'Materials Stock', '🪵', 'In Stock', '~3 cubic metres');

-- ────────────────────────────────────────────────────────────
-- 0010_storage_bucket.sql
-- ────────────────────────────────────────────────────────────
-- Slice 4: Supabase Storage bucket for job photos.
--
-- The bucket is **private** — clients can't fetch photos directly.
-- Photo paths are stored as text[] on jobs.photos_before / photos_after.
-- The app generates short-lived signed URLs server-side (in /admin and
-- /worker job detail pages) when it needs to display them.
--
-- Path convention: jobs/<job-id>/<before|after>/<uuid>.jpg
--
-- All uploads + reads happen server-side via the service-role key, so
-- no anon-role storage policies are needed. RLS on storage.objects is
-- left at Supabase defaults (deny all) for the anon and authenticated
-- roles. If we ever switch to direct-from-browser uploads, we'll add
-- the appropriate policies in a follow-up migration.

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────
-- 0011_user_lockout.sql
-- ────────────────────────────────────────────────────────────
-- Slice 9: per-user login-failure tracking + lockout.
--
-- Mitigates the small PIN keyspace (4 digits = 10 000 combos). Five
-- consecutive failures lock the account for 15 minutes. Successful
-- login zeroes the counter.
--
-- Used by both worker (PIN) and admin (password) auth paths in
-- src/lib/auth.ts. Admin lockout is rarer in practice but the same
-- column applies — defence in depth.

alter table public.users
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_until           timestamptz;

create index if not exists users_locked_idx on public.users (locked_until)
  where locked_until is not null;

-- ────────────────────────────────────────────────────────────
-- 0012_password_reset.sql
-- ────────────────────────────────────────────────────────────
-- Slice 9: admin password-reset token storage.
--
-- bcrypt-hashed token (so a DB leak doesn't expose live reset URLs)
-- with a one-hour TTL. The flow:
--   1. /forgot-password POSTs the admin's email
--   2. Server mints a random token, stores its bcrypt hash + expiry
--   3. Server emails a link `/reset-password?token=<raw>` via Resend
--   4. /reset-password POSTs the raw token + new password; server
--      bcrypt.compares against the stored hash, updates password_hash,
--      clears the token + any lockout from migration 0011
--
-- Token columns are nullable; populated only during an active reset.

alter table public.users
  add column if not exists reset_token_hash       text,
  add column if not exists reset_token_expires_at timestamptz;

create index if not exists users_reset_token_idx
  on public.users (reset_token_expires_at)
  where reset_token_hash is not null;

-- ────────────────────────────────────────────────────────────
-- 0013_enquiries_caps.sql
-- ────────────────────────────────────────────────────────────
-- Defense in depth on the public enquiries form.
--
-- The /api/enquiries route already truncates oversized inputs at the
-- application layer, but a misconfigured client (or a future bug that
-- bypasses the truncation helper) shouldn't be able to dump a megabyte
-- of SEO spam into a single row. The CHECK constraints here are a
-- last-ditch guard at the database boundary.
--
-- Limits match the application caps in src/app/api/enquiries/route.ts.
-- If you change them, change both — they're not auto-generated.

alter table public.enquiries
  add constraint enquiries_first_name_len    check (char_length(first_name)   <= 80),
  add constraint enquiries_last_name_len     check (char_length(last_name)    <= 80),
  add constraint enquiries_email_len         check (char_length(email)        <= 200),
  add constraint enquiries_phone_len         check (phone is null         or char_length(phone)        <= 32),
  add constraint enquiries_suburb_len        check (char_length(suburb)       <= 120),
  add constraint enquiries_service_type_len  check (char_length(service_type) <= 80),
  add constraint enquiries_client_type_len   check (client_type is null   or char_length(client_type)  <= 80),
  add constraint enquiries_message_len       check (message is null       or char_length(message)      <= 2000);

-- ────────────────────────────────────────────────────────────
-- 0014_job_array_appends.sql
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 0015_leave_balance_atomic.sql
-- ────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────
-- 0016_idempotency_keys.sql
-- ────────────────────────────────────────────────────────────
-- Idempotency surfaces — proper unique-index dedup for webhooks + cron.
--
-- M9: Generic external-reference dedup for any future webhook source
-- that creates jobs. A dedicated, indexed `external_ref` column with a
-- partial unique index lets the webhook handler do
-- `INSERT … ON CONFLICT (external_ref) DO NOTHING` instead of grepping
-- `description` (which is a free-text field shown on invoices).
--
-- M19: cron jobs (shift-reminder, job-reminders) don't currently track
-- which days they've already run. A retry from Vercel after a flaky
-- run could send duplicate notifications. A `cron_runs` table keyed
-- on (job_name, run_date) gives us "already ran for today, skip" with
-- a single insert + ON CONFLICT.

-- ── M9: Jobs.external_ref
alter table public.jobs
  add column if not exists external_ref text;

-- Partial unique index — `external_ref` is null for normal jobs (most
-- of them), and a UNIQUE on a nullable column with multiple nulls is
-- only legal as a partial index in Postgres.
create unique index if not exists jobs_external_ref_uniq
  on public.jobs (external_ref)
  where external_ref is not null;

-- ── M19: Cron run tracking
create table if not exists public.cron_runs (
  job_name   text        not null,
  run_date   date        not null,
  ran_at     timestamptz not null default now(),
  detail     jsonb,
  primary key (job_name, run_date)
);

-- This table is service-role only. Cron handlers always run through
-- the service-role key; no admin/worker UI ever touches it.
alter table public.cron_runs enable row level security;
-- (no policies → no access for anon/authenticated; service_role
--  bypasses RLS as usual)

-- ────────────────────────────────────────────────────────────
-- 0017_user_public_slug.sql
-- ────────────────────────────────────────────────────────────
-- Public slug for workers — stops the login dropdown leaking real
-- internal user UUIDs to the open internet.
--
-- Today /api/auth/workers returns `{ id: uuid, name, colour }` to any
-- visitor of the login page. The id is then POSTed back as the
-- credentials provider's `worker_id`. Two consequences:
--
--   1. UUIDs are stable, sortable identifiers we use across other
--      tables (jobs.assigned_worker_ids, leave_requests.worker_id,
--      audit_log.actor_id). Leaking them makes targeted attacks
--      easier — a brute-forcer who already knows a name can lock that
--      specific account by failing PIN attempts under that UUID, and
--      can correlate hypothetical other leaks.
--   2. Workers' real UUIDs end up in browser DevTools, network
--      tabs, etc. — fine for our threat model today but free to fix.
--
-- The slug is a 16-char alphanumeric string (62^16 ≈ 4.7e28). Unique
-- per user. /api/auth/workers will return slug + name + colour; the
-- credentials provider takes the slug and resolves it to the real
-- UUID server-side before the bcrypt compare.
--
-- Migration is idempotent — column add is `if not exists`, the slug
-- generator only fills nulls, and the unique index uses `if not
-- exists` semantics.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists public_slug text;

-- Backfill any existing rows with a fresh slug. We do this in pure SQL
-- so it runs as part of the migration with no app-side script.
-- substr(replace(...)) trims `gen_random_uuid()`'s dashes and takes the
-- first 16 hex characters — collision-resistant enough at our scale.
update public.users
   set public_slug = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
 where public_slug is null;

-- After backfill the column can be NOT NULL.
alter table public.users
  alter column public_slug set not null;

-- Unique partial index in case future rows skip the backfill.
create unique index if not exists users_public_slug_uniq
  on public.users (public_slug);

-- New rows: default to a freshly generated slug.
alter table public.users
  alter column public_slug set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

-- ────────────────────────────────────────────────────────────
-- 0018_time_log_per_worker.sql
-- ────────────────────────────────────────────────────────────
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
