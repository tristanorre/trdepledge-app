-- Slice 4: Supabase Storage bucket for job photos.
--
-- The bucket is **private** — clients can't fetch photos directly.
-- Photo paths are stored as text[] on jobs.photos_before / photos_after.
-- The app generates short-lived signed URLs server-side (in /admin and
-- /worker job detail pages) when it needs to display them.
--
-- Path convention: jobs/<job-id>/<before|after>/<uuid>.jpg
--
-- All uploads + reads happen server-side via the service-role key, so
-- no anon-role storage policies are needed. RLS on storage.objects is
-- left at Supabase defaults (deny all) for the anon and authenticated
-- roles. If we ever switch to direct-from-browser uploads, we'll add
-- the appropriate policies in a follow-up migration.

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;
