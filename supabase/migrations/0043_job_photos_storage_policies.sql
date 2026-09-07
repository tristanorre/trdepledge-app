-- The three job-photos policies on storage.objects, written down.
--
-- WHY THIS EXISTS
--
-- These have been live in production since some point after 0010 and were
-- never in `supabase/migrations/`. Same drift as 0041 and 0042: rebuild from
-- source and storage.objects comes back with RLS on and no policies at all.
-- 0042 pins search_path on the functions these policies call; this file is
-- the other half — the callers.
--
-- 0010_storage_bucket.sql still says "no anon-role storage policies are
-- needed" because everything goes through the service role. That stopped
-- being the whole story when these were added. It is left as written: it was
-- true when it was written, and the correction belongs here rather than in
-- an edit that makes the old file look prescient.
--
-- READ THIS BEFORE YOU TRUST THESE POLICIES.
--
-- As of 2026-09-07 all three are inert. They are permissive policies with no
-- role restriction, so they apply to every non-bypassing role — but the
-- `app` schema has default privileges (owner only, no grant to anon or
-- authenticated), so those two roles cannot execute app.can_access_job_photo
-- or app.is_admin at all. Verified, not inferred: `set local role anon` then
-- selecting from storage.objects for this bucket raises
--
--     42501: permission denied for schema app
--     CONTEXT: SQL function "can_access_job_photo" during startup
--
-- and `authenticated` raises the same. Meanwhile postgres and service_role
-- both have BYPASSRLS, so the policies are never consulted for them. Every
-- role they apply to cannot evaluate them; every role that could evaluate
-- them skips them.
--
-- So these read as though a logged-in worker could fetch their own job
-- photos directly, and no role can currently do that. Nothing is broken by
-- it — the bucket is private, and the app signs URLs server-side through the
-- service role (`signPhotoUrls`), which is the only path that has ever been
-- used. But if direct-from-browser access is ever wanted, the missing piece
-- is `grant usage on schema app to authenticated`, and that is a deliberate
-- widening of the anon key's reach, not a fix to slip into a transcription.
-- Left alone here on purpose.
--
-- The predicates themselves are sound, which is why 0042 mattered: with
-- search_path pinned, a shadowed `public.jobs` can no longer change who
-- can_access_job_photo says yes to.
--
-- ALREADY APPLIED IN PRODUCTION — this is a transcription of the live
-- policies, read back from pg_policy on 2026-09-07, not a change. The drop
-- before each create is what makes the file re-runnable; there is no
-- `create policy if not exists`. Re-running it against production replaces
-- each policy with an identical one inside a transaction.
--
-- RLS is not enabled here: Supabase ships storage.objects with RLS already
-- on (verified: relrowsecurity = true), and the table is owned by
-- supabase_storage_admin, so this file issues no DDL it does not need.
-- Run it as postgres, which is what the SQL editor gives you.

-- Read: an admin sees every job photo; a worker sees photos for jobs they
-- are assigned to. The path convention from 0010 is
-- jobs/<job-id>/<before|after>/<uuid>.jpg — can_access_job_photo takes the
-- first path segment as the job id, which is why the object name alone is
-- enough to answer.
drop policy if exists job_photos_read on storage.objects;
create policy job_photos_read
  on storage.objects
  for select
  using (bucket_id = 'job-photos' and app.can_access_job_photo(name));

-- Insert: same predicate as read, as a with-check. A worker may only add a
-- photo under a job they are on.
drop policy if exists job_photos_insert on storage.objects;
create policy job_photos_insert
  on storage.objects
  for insert
  with check (bucket_id = 'job-photos' and app.can_access_job_photo(name));

-- Delete: admin only. Workers add photos and cannot remove them — the job
-- record is evidence, and deleting it is Thomas's call.
drop policy if exists job_photos_delete on storage.objects;
create policy job_photos_delete
  on storage.objects
  for delete
  using (bucket_id = 'job-photos' and app.is_admin());

-- There is deliberately no update policy. Storage objects are written once
-- and replaced by a new upload, never mutated in place.
