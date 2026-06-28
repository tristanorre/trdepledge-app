-- Field-worker flag for users with a joint admin + worker role.
-- Thomas (admin + CEO + active in the field) needs to appear in
-- worker-listing queries (job assignment, inventory assignment,
-- payroll, time-allocation board, etc.) while keeping his admin
-- role + admin app access intact. He keeps admin login; this flag
-- just makes him show up alongside the workers wherever they're
-- listed.

alter table public.users
  add column if not exists field_worker boolean not null default false;

-- Partial index: keeps the OR queries cheap (the common path is
-- "anyone who shows up in worker lists" = role='worker' OR
-- field_worker=true; this covers the latter half).
create index if not exists users_field_worker_idx
  on public.users (field_worker) where field_worker = true;

-- Flag Thomas. The CHECK on role still says role IN ('admin','worker')
-- so we keep role='admin' (granting full admin privileges) and use the
-- new flag to opt him into worker-listing queries.
update public.users
   set field_worker = true
 where role = 'admin'
   and lower(name) like '%thomas depledge%';
