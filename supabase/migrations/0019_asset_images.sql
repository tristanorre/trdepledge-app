-- Inventory: optional uploaded image per asset.
--
-- Why: Thomas wants real photos of mowers, vehicles, etc. instead of
-- (or alongside) the emoji icon. Path lives in storage; the DB just
-- stores the storage key.
--
-- Path convention: assets/<asset-id>/<timestamp>.<ext>
--
-- The `asset-images` storage bucket is **private** — same pattern as
-- `job-photos`. Clients never fetch directly; the app generates short
-- signed URLs server-side for display. All uploads go through the
-- service-role key in /api/admin/inventory/[id]/image.

-- ── Column on assets
alter table public.assets
  add column if not exists image_path text;

-- ── Storage bucket
insert into storage.buckets (id, name, public)
values ('asset-images', 'asset-images', false)
on conflict (id) do nothing;
