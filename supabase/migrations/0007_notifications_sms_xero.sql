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
