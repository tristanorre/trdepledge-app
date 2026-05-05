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
