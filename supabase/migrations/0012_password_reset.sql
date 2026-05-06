-- Slice 9: admin password-reset token storage.
--
-- bcrypt-hashed token (so a DB leak doesn't expose live reset URLs)
-- with a one-hour TTL. The flow:
--   1. /forgot-password POSTs the admin's email
--   2. Server mints a random token, stores its bcrypt hash + expiry
--   3. Server emails a link `/reset-password?token=<raw>` via Resend
--   4. /reset-password POSTs the raw token + new password; server
--      bcrypt.compares against the stored hash, updates password_hash,
--      clears the token + any lockout from migration 0011
--
-- Token columns are nullable; populated only during an active reset.

alter table public.users
  add column if not exists reset_token_hash       text,
  add column if not exists reset_token_expires_at timestamptz;

create index if not exists users_reset_token_idx
  on public.users (reset_token_expires_at)
  where reset_token_hash is not null;
