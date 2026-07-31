-- DIY Hire: uploaded equipment photos.
--
-- Why this bucket is PUBLIC, unlike `job-photos` and `asset-images`:
--
-- Those two hold customer property and internal records, so they're
-- private and the app hands out short-lived signed URLs. Hire photos are
-- the opposite — product shots on a public marketing page, served to
-- anonymous visitors who are not logged in and never will be.
--
-- Signing them would technically work (/hire is force-dynamic, so a fresh
-- URL could be minted per request) but it would be actively worse: a URL
-- that changes every request can't be cached by the browser or the CDN, so
-- every visitor re-downloads every photo on every page view. For images
-- whose whole purpose is to be seen by the public, a stable public URL is
-- both simpler and faster.
--
-- Writes are still privileged: uploads go through the service-role key in
-- /api/admin/hire/equipment/[id]/photo, behind requireApiAdmin. `public`
-- on a bucket governs READS only.
--
-- Path convention: equipment/<equipment-id>/<timestamp>.<ext>

insert into storage.buckets (id, name, public)
values ('hire-photos', 'hire-photos', true)
on conflict (id) do update set public = true;
