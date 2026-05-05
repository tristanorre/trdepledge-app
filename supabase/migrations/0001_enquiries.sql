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
