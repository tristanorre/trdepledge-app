-- The Lawn Mower now has a flyer, so the card gets its "View the flyer"
-- link like every other item.
--
-- The Wacker Packer needs no row change — its flyer_path already pointed at
-- /hire/flyer-wacker-packer.webp and the file was replaced in place with a
-- version in the current house style.
--
-- Both flyers were generated from the same template as the printed set
-- (see the PR for how). The mower's artwork is the cartoon cut-out that
-- CUTOUT_PHOTO_SLUGS already flags — it's the only image we have of it, and
-- it reads as an illustration next to the photographic ones.

update public.equipment
set flyer_path = '/hire/flyer-lawn-mower.webp'
where slug = 'lawn-mower';
