-- Force a PIN change on next worker sign-in.
--
-- Set true when an admin seeds a default/temporary PIN (e.g. 1234 for
-- a new starter). The worker app blocks every page behind a
-- change-your-PIN screen until it's cleared, which happens
-- automatically when /api/worker/me/pin succeeds.
--
-- Note the app's own weak-PIN denylist (src/lib/pin.ts) rejects 1234,
-- so a worker cannot re-set the default they were given — the only
-- way out of the blocking screen is a genuinely new PIN.

alter table public.users
  add column if not exists must_change_pin boolean not null default false;

-- Partial index — the layout checks this on every worker page load,
-- but only a handful of rows are ever true.
create index if not exists users_must_change_pin_idx
  on public.users (id) where must_change_pin;
