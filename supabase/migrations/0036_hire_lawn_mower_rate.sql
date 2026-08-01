-- The lawn mower's daily rate: $40 -> $50.
--
-- $40 was invented for the prototypes and was the last figure on the hire
-- page that Thomas hadn't signed off — the other five come from the
-- flyers. It's now confirmed at $50, so `UNCONFIRMED_RATE_SLUGS` in
-- src/lib/hire/config.ts empties out and nothing on the page is a guess.
--
-- Existing reservations are deliberately untouched. `hire_total` is stored
-- per reservation at the rate quoted when the request was made, so anyone
-- already in the diary keeps the price they were given. Repricing a
-- booking someone has already been texted about would be the wrong kind of
-- tidy.

update public.equipment set daily_rate = 50.00 where slug = 'lawn-mower';
