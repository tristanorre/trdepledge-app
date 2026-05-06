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
