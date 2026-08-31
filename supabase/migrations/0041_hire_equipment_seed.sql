-- The hire floor, written down.
--
-- WHY THIS EXISTS
--
-- Six of the seven tools existed only in the live database. They were seeded
-- out of band at some point before the migrations were being kept honest, so
-- `supabase/migrations/` described a hire system with exactly one item in it
-- — the Deutscher Slasher, the only tool with a real insert (0037). Rebuild
-- from source and the yard came back empty.
--
-- That is a poor thing to discover at the same moment you discover you need
-- a rebuild. It matters more now than it did last week for two reasons: the
-- hire side is about to go live, so these rows are about to start carrying
-- real reservations that reference them; and the project is on a Supabase
-- plan with no point-in-time recovery, so migrations plus a dump is the
-- whole of the recovery story.
--
-- ALREADY APPLIED IN PRODUCTION — DO NOT RUN THIS AGAINST THE LIVE DATABASE.
--
-- This is a transcription, not a change. Every value below was read back
-- from the live rows on 2026-08-31 rather than reconstructed from the
-- prototype, so applying it to production would be a no-op even if the
-- guards were not here. It exists so a fresh environment matches, and so the
-- next person to read the migrations sees the floor that actually exists.
--
-- `on conflict (slug) do nothing` rather than an upsert, deliberately.
-- Thomas edits this equipment through /admin/hire/equipment — rates, blurbs,
-- photos, publish state. An upsert would quietly revert his work to whatever
-- was true in August the next time anyone ran the migrations. Insert-if-
-- absent is the only shape that is safe to re-run against a database
-- somebody has been using.
--
-- Money is numeric(10,2) here, matching the hire schema. That diverges from
-- the house cents-everywhere rule on purpose; src/lib/hire/repo.ts converts
-- at the boundary. See CLAUDE.md.

insert into public.equipment
  (slug, name, category, blurb, specs, daily_rate, bond,
   photo_path, flyer_path, is_published, sort_order, changeover_days)
values
  (
    'cement-mixer',
    'Cement Mixer',
    'Concrete',
    'Tilting drum for concrete, mortar and render. Wheels around site easily.',
    array[
      'Large drum for medium to big pours',
      'Strong motor, mixes evenly every time',
      'Tilt-and-pour with a single handle'
    ],
    50.00, 100.00,
    '/hire/cement-mixer.webp', '/hire/flyer-cement-mixer.webp',
    true, 1, 0
  ),
  (
    'post-hole-digger',
    'Post Hole Digger',
    'Earth',
    'Two-stroke auger for fence posts, tree planting and small footings.',
    array[
      'High torque, drills fast in hard ground',
      'Twin handles for control',
      'Light enough for one person'
    ],
    50.00, 100.00,
    '/hire/post-hole-digger.webp', '/hire/flyer-post-hole-digger.webp',
    true, 2, 0
  ),
  (
    'demolition-hammer',
    'Demolition Hammer',
    'Demolition',
    'Breaks concrete, brick, mortar and stone. Chisel and point supplied.',
    array[
      'High impact for slabs and footings',
      'Heavy-duty build, comfort grips',
      'Chisel and point bits included'
    ],
    50.00, 100.00,
    '/hire/demolition-hammer.webp', '/hire/flyer-demolition-hammer.webp',
    true, 3, 0
  ),
  (
    'wacker-packer',
    'Wacker Packer',
    'Compaction',
    '6.5hp plate compactor. Beds down soil, sand and gravel before paving.',
    array[
      'Ideal for paving and slab prep',
      'Firm, level base in a couple of passes',
      'Simple controls, quick to start'
    ],
    80.00, 100.00,
    '/hire/wacker-packer.webp', '/hire/flyer-wacker-packer.webp',
    true, 4, 0
  ),
  (
    'lawn-roller',
    '60L Steel Lawn Roller',
    'Lawn',
    'Fill with water and roll for a smooth, level finish on lawn and soil.',
    array[
      '60 litre steel drum for real weight',
      'Ergonomic handle, no engine to worry about',
      'Great after topdressing or new turf'
    ],
    50.00, 100.00,
    '/hire/lawn-roller.webp', '/hire/flyer-lawn-roller.webp',
    true, 5, 0
  ),
  (
    'lawn-mower',
    'Lawn Mower',
    'Lawn',
    'Catcher mower for a block that has got away from you.',
    array[
      'Catcher included, height adjustable',
      'Handles long or overgrown grass',
      'Goes out fuelled and sharpened'
    ],
    50.00, 100.00,
    '/hire/lawn-mower.webp', '/hire/flyer-lawn-mower.webp',
    true, 6, 0
  )
on conflict (slug) do nothing;

-- The Deutscher Slasher is NOT repeated here. It has a real insert in 0037,
-- and duplicating it would mean two places to change if it ever moves. This
-- migration covers exactly the gap 0037 left.
