-- Health monitoring state.
--
-- WHY THIS EXISTS
-- Four failures ran silently for weeks before anyone noticed: a migration
-- that was never applied (3 weeks), a OneSignal key that was wrong from the
-- day it was set (3 months), a Resend domain that was never verified (3
-- months), and a cron that has never once run. Every one of them was
-- invisible because nothing was looking.
--
-- The existing integrations.ts answers "is X configured?" by checking the
-- env var is present. That is precisely what missed the OneSignal outage:
-- the variable WAS present, it just held the wrong value. So the checks
-- that write to this table prove liveness by calling the API, not by
-- reading config.
--
-- ONE ROW PER CHECK, updated in place. This is current state, not a log —
-- the interesting history (what broke, when) is `since`, and the audit
-- trail people actually read is the notification they were sent.
create table if not exists public.health_checks (
  key              text        primary key,

  -- 'ok' | 'warn' | 'fail'. warn is for things that are degrading but
  -- still working — a Xero token three days from expiry, a backlog that
  -- is growing. fail is for something a customer or worker would notice.
  status           text        not null,
  detail           text        not null default '',

  -- When the CURRENT status began. Not the last check time — this is what
  -- turns "push is broken" into "push has been broken for 12 days", which
  -- is the number that makes someone act.
  since            timestamptz not null default now(),
  checked_at       timestamptz not null default now(),

  -- The status we last sent a notification for. Alerting compares against
  -- this rather than against the previous check, so a failure notifies
  -- once when it starts and once when it clears — never daily. A monitor
  -- that pings every day gets muted, and a muted monitor is worse than no
  -- monitor because it looks like coverage.
  notified_status  text,
  notified_at      timestamptz,

  constraint health_checks_status_valid
    check (status in ('ok', 'warn', 'fail')),
  constraint health_checks_notified_valid
    check (notified_status is null or notified_status in ('ok', 'warn', 'fail'))
);

-- Service-role only, matching cron_runs. The admin UI reads through a
-- server route, never with the anon key.
alter table public.health_checks enable row level security;

comment on table public.health_checks is
  'Current state of each system health check. One row per check, updated in place. See lib/health.ts.';
