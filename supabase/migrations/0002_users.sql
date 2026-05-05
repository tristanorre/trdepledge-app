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
