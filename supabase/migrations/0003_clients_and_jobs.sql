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
