-- Drop the materials_catalogue.quantity_on_hand column added in 0020.
--
-- Reverted: Thomas buys materials per-job rather than holding stock,
-- so a "quantity on hand" tracker isn't useful and the empty column
-- is just visual noise on the /admin/materials page. The catalogue
-- now stores only Description, Unit, and Cost-per-unit; quantity and
-- total cost live on each per-job materials line (where they
-- actually mean something).
--
-- Idempotent — safe whether 0020 has already been applied or not.

alter table public.materials_catalogue
  drop column if exists quantity_on_hand;
