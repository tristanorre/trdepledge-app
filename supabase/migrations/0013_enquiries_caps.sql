-- Defense in depth on the public enquiries form.
--
-- The /api/enquiries route already truncates oversized inputs at the
-- application layer, but a misconfigured client (or a future bug that
-- bypasses the truncation helper) shouldn't be able to dump a megabyte
-- of SEO spam into a single row. The CHECK constraints here are a
-- last-ditch guard at the database boundary.
--
-- Limits match the application caps in src/app/api/enquiries/route.ts.
-- If you change them, change both — they're not auto-generated.

-- Idempotent: drop-and-recreate so the bundle can be re-run without
-- failing on "constraint already exists" (Postgres doesn't support
-- ADD CONSTRAINT IF NOT EXISTS for check constraints).
alter table public.enquiries drop constraint if exists enquiries_first_name_len;
alter table public.enquiries drop constraint if exists enquiries_last_name_len;
alter table public.enquiries drop constraint if exists enquiries_email_len;
alter table public.enquiries drop constraint if exists enquiries_phone_len;
alter table public.enquiries drop constraint if exists enquiries_suburb_len;
alter table public.enquiries drop constraint if exists enquiries_service_type_len;
alter table public.enquiries drop constraint if exists enquiries_client_type_len;
alter table public.enquiries drop constraint if exists enquiries_message_len;

alter table public.enquiries
  add constraint enquiries_first_name_len    check (char_length(first_name)   <= 80),
  add constraint enquiries_last_name_len     check (char_length(last_name)    <= 80),
  add constraint enquiries_email_len         check (char_length(email)        <= 200),
  add constraint enquiries_phone_len         check (phone is null         or char_length(phone)        <= 32),
  add constraint enquiries_suburb_len        check (char_length(suburb)       <= 120),
  add constraint enquiries_service_type_len  check (char_length(service_type) <= 80),
  add constraint enquiries_client_type_len   check (client_type is null   or char_length(client_type)  <= 80),
  add constraint enquiries_message_len       check (message is null       or char_length(message)      <= 2000);
