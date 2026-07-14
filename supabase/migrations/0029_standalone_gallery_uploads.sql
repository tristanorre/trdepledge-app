-- Standalone gallery uploads — photos Thomas adds directly from his
-- phone that aren't attached to any job. They live in the same
-- job-photos storage bucket under a `standalone/<uuid>.<ext>` prefix,
-- so signPhotoUrls doesn't need special handling.
--
-- Curation flow is identical to job photos: standalone photos appear
-- on /admin/photos and can be Featured onto /gallery via the same
-- featured_photos table. Unfeaturing a standalone photo hides it from
-- the site but keeps it in the pool — deleting the standalone_photos
-- row is a separate action.

create table if not exists public.standalone_photos (
  id            uuid        primary key default gen_random_uuid(),
  storage_path  text        not null unique,
  kind          text        not null check (kind in ('before', 'after')),
  uploaded_by   uuid        references public.users(id) on delete set null,
  uploaded_at   timestamptz not null default now()
);

create index if not exists standalone_photos_uploaded_at_idx
  on public.standalone_photos (uploaded_at desc);

-- featured_photos.job_id must accept null so a standalone photo (which
-- has no job) can still be featured.
alter table public.featured_photos alter column job_id drop not null;
