-- The floor, brought into line with the current flyers.
--
-- Thomas supplied a new set of five flyers. Three rates on them differ from
-- what was seeded, and one tool is new. The flyers are the authority — they
-- are what a customer is holding when they ring up.
--
--   Post Hole Digger    $80 -> $50
--   Demolition Hammer   $80 -> $50
--   60L Steel Roller    $30 -> $50
--   Cement Mixer        $50    (unchanged, flyer agrees)
--   Deutscher Slasher   NEW at $150/day
--
-- The Wacker Packer and Lawn Mower have no flyer in the new set but stay
-- published and unchanged. A missing flyer is not the same as a tool
-- leaving the floor — the mower has never had one.
--
-- Existing reservations are untouched, as in 0036. `hire_total` is stored
-- per reservation at the rate quoted when the request was made, so nobody
-- already in the diary is repriced.

update public.equipment set daily_rate = 50.00 where slug = 'post-hole-digger';
update public.equipment set daily_rate = 50.00 where slug = 'demolition-hammer';
update public.equipment set daily_rate = 50.00 where slug = 'lawn-roller';

-- Bond follows the house figure from 0035 rather than being restated per
-- item. Categorised under Lawn so it joins the existing filter chip instead
-- of creating one of its own for a single tool.
insert into public.equipment
  (slug, name, category, blurb, specs, daily_rate, bond,
   photo_path, flyer_path, is_published, sort_order, changeover_days)
values (
  'deutscher-slasher',
  'Deutscher Slasher',
  'Lawn',
  'Self-propelled walk-behind slasher for long grass, scrub and acreage.',
  array[
    'Wide deck, covers big areas fast',
    'Self-propelled with variable speed',
    'Takes on scrub and rough ground'
  ],
  150.00,
  100.00,
  '/hire/deutscher-slasher.webp',
  '/hire/flyer-deutscher-slasher.webp',
  true,
  (select coalesce(max(sort_order), 0) + 1 from public.equipment),
  0
)
on conflict (slug) do nothing;
