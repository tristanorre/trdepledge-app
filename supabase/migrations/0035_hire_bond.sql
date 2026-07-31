-- DIY Hire — bond set at $100, and a way for Thomas to not charge it.
--
-- Two changes that belong together:
--
--   1. Every item's bond becomes $100. They were placeholders ranging
--      $50–$150, invented for the prototypes. Thomas has now given one
--      figure for the whole floor, so `BONDS_CONFIRMED` in
--      src/lib/hire/config.ts flips to true alongside this.
--
--   2. `bond_waived` lets him decide not to take it — a regular customer
--      he trusts, a trade mate, or any reason he likes.
--
-- WHY THE FLAG RATHER THAN ZEROING bond_total:
--
-- bond_total keeps saying what the bond WOULD have been. That's the fact
-- worth keeping: "waived $100 for this customer" is a different record
-- from "this item has no bond", and only the first tells you what the
-- goodwill cost. Amount due at pickup is derived — see amountDueAtPickup()
-- in src/lib/hire/types.ts, which every caller goes through so the figure
-- can't be assembled two different ways.

alter table public.reservations
  add column if not exists bond_waived boolean not null default false;

comment on column public.reservations.bond_waived is
  'True when Thomas has decided not to collect the bond on this hire. '
  'bond_total still records what it would have been; the amount actually '
  'due at pickup is hire_total + (bond_waived ? 0 : bond_total).';

-- One bond for the whole floor. Applies to soft-deleted rows too: if an
-- item is ever restored it should come back with the current figure, not
-- the placeholder it was retired with.
update public.equipment set bond = 100.00 where bond is distinct from 100.00;

-- Existing reservations keep the bond they were quoted. A customer who was
-- told $150 at request time is not retrospectively repriced by a migration
-- — Thomas can waive it if he wants to make it right.
