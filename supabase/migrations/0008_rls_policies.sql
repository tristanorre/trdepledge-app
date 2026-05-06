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
