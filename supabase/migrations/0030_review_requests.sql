-- Review-request pipeline. When a job transitions to 'completed' the
-- app inserts one row here and fires an SMS + email to the client with
-- a link to /feedback/<token>. The client picks 1-5 stars; 4+ gets
-- deep-linked to the Google Business review form, <=3 gets a private
-- textarea that emails Thomas directly (bad ratings never touch Google).
--
-- One row per job (unique). Repeating the "send" action for the same
-- job just overwrites sent_at / sent_via so the SMS log has fresh
-- context.
--
-- Storage layout:
--   * `token` is a URL-safe opaque id (crypto.randomUUID with hyphens
--     stripped — 32 hex chars). Not derivable from job_id, so the
--     link doesn't leak internal ids.
--   * `sent_via` is a text[] of channels that succeeded ('sms', 'email').
--   * `rating` is populated only after the client responds. Null while
--     pending. The UI reads this to decide whether to show "waiting"
--     vs. "3★ — 'lawn was still messy'" on the admin job page.

create table if not exists public.review_requests (
  id                     uuid        primary key default gen_random_uuid(),
  created_at             timestamptz not null    default now(),
  updated_at             timestamptz not null    default now(),

  job_id                 uuid        not null    unique
                                     references public.jobs(id) on delete cascade,
  client_id              uuid        references public.clients(id) on delete set null,

  token                  text        not null    unique,

  sent_at                timestamptz,
  sent_via               text[]      not null    default '{}',
  reminded_at            timestamptz,

  responded_at           timestamptz,
  rating                 integer     check (rating between 1 and 5),
  private_feedback       text,
  redirected_to_google   boolean     not null    default false
);

create index if not exists review_requests_job_idx    on public.review_requests (job_id);
create index if not exists review_requests_rating_idx on public.review_requests (rating) where rating is not null;

drop trigger if exists review_requests_set_updated_at on public.review_requests;
create trigger review_requests_set_updated_at
  before update on public.review_requests
  for each row execute function public.set_updated_at();
