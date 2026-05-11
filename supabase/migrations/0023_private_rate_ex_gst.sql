-- Migration: Private rate stored as EX-GST so Xero can add the 10%
-- GST on top via the account's "GST on Income" tax rate.
--
-- Previously the rate was $55/hr stored as 5500 cents and treated as
-- "inc GST". After connecting Xero (account 500 — Sales, GST on
-- Income) we observed Xero adding 10% on top of every line, so
-- invoices were going out at $60.50/hr — wrong.
--
-- Fix: store the ex-GST amount. $50.00 ex-GST → $55.00 on the issued
-- invoice once Xero applies its tax rate. Idempotent — re-runs leave
-- the value at 5000 either way.

-- ── Private rate $50.00 ex-GST = 5000 cents ────────────────────────
update public.config
   set value = '5000'
 where key   = 'private_rate_cents';

-- Insert if it doesn't exist yet (fresh DB).
insert into public.config (key, value)
values ('private_rate_cents', '5000')
on conflict (key) do nothing;

-- NDIS rate is unchanged. NDIS payments are GST-free under the NDIS
-- Act, so the corresponding Xero account should be set to GST-free
-- (or the invoice line should carry TaxType=NONE). The $56.98 stays
-- as the headline number on the invoice.
