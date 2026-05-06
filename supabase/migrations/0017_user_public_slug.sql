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
