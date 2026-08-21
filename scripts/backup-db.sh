#!/usr/bin/env bash
#
# Logical backup of the production database.
#
# WHY THIS EXISTS
# The schema is already safe — all 39 migrations live in supabase/migrations
# and are in git, so the structure can be rebuilt from source at any time.
# What is NOT recoverable is the DATA: 325 jobs, 41 clients, 6 users, leave
# balances, paid hours, and the audit log. The project is on the Supabase
# free plan, which has no point-in-time recovery, so a bad migration or a
# mistaken DELETE is currently unrecoverable. This script is the stopgap
# until the project moves to a plan that includes PITR.
#
# WHAT IT DOES NOT COVER
#   * Storage buckets (job photos, hire photos, flyers). Those live in
#     Supabase Storage, not Postgres, and pg_dump does not touch them.
#     They need a separate sync — worth doing, not done here.
#   * Anything written after the dump completes.
#
# USAGE
#   1. Get the connection string:
#        Supabase dashboard → Project Settings → Database → Connection string
#        → URI. Use the SESSION POOLER string for a one-off dump.
#   2. export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@...'
#   3. ./scripts/backup-db.sh
#
# The connection string contains the database password. Do not commit it,
# do not paste it into chat, and prefer exporting it in the shell over
# putting it in a file.
#
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is not set." >&2
  echo "See the header of this script for where to get it." >&2
  exit 1
fi

OUT_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"

SCHEMA_FILE="$OUT_DIR/schema-$STAMP.sql"
DATA_FILE="$OUT_DIR/data-$STAMP.sql"

echo "→ Dumping schema…"
pg_dump "$SUPABASE_DB_URL" \
  --schema-only --no-owner --no-privileges \
  --schema=public --schema=app \
  --file "$SCHEMA_FILE"

# Data dump excludes xero_tokens on purpose. Those rows hold live OAuth
# access and refresh tokens; putting them in a file that gets copied to a
# laptop or a cloud drive turns one backup into a credential leak. Xero can
# simply be reconnected through the OAuth flow after a restore, so nothing
# of value is lost by leaving them out.
echo "→ Dumping data (excluding xero_tokens)…"
pg_dump "$SUPABASE_DB_URL" \
  --data-only --no-owner --no-privileges \
  --schema=public --schema=app \
  --exclude-table-data='public.xero_tokens' \
  --file "$DATA_FILE"

echo "→ Compressing…"
gzip -f "$SCHEMA_FILE" "$DATA_FILE"

echo
echo "Done:"
ls -lh "$OUT_DIR" | tail -2
echo
echo "These files contain customer names, addresses, phone numbers and payroll"
echo "data. Store them somewhere access-controlled and encrypted, not in the"
echo "repo and not in a public cloud folder."
