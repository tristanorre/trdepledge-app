-- Curated before/after photos surfaced on the public marketing gallery.
-- Admins pick items from the job before/after photo pool on
-- /admin/photos; only the rows inserted here show up on /gallery.
--
-- The uniqueness constraint means the same photo can only be
-- featured once. Deleting the job cascades — a job that gets
-- removed can't stay on the marketing gallery by accident.

create table if not exists public.featured_photos (
  id          uuid        primary key default gen_random_uuid(),
  job_id      uuid        not null references public.jobs(id) on delete cascade,
  kind        text        not null check (kind in ('before', 'after')),
  storage_path text       not null,
  caption     text,
  sort_order  integer     not null default 0,
  featured_at timestamptz not null default now(),
  featured_by uuid        references public.users(id) on delete set null,

  unique (storage_path)
);

-- Index for the gallery query (order by sort_order then featured_at desc).
create index if not exists featured_photos_sort_idx
  on public.featured_photos (sort_order, featured_at desc);
