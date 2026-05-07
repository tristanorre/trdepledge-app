#!/usr/bin/env bash
# Regenerate supabase/all-migrations.sql by concatenating every
# migration in supabase/migrations/ in numeric order. The bundle is
# idempotent (each migration uses IF NOT EXISTS / ON CONFLICT DO NOTHING)
# so it's safe to paste into the Supabase SQL editor against a project
# that's already partly migrated — only the new statements run.
#
# Run this whenever a migration is added.

set -euo pipefail

cd "$(dirname "$0")/.."

OUT="supabase/all-migrations.sql"
MIG_DIR="supabase/migrations"

{
  echo "-- ============================================================"
  echo "-- T.R. Depledge — full schema, paste this into Supabase SQL editor."
  echo "-- Generated $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/build-all-migrations.sh"
  echo "-- Idempotent: safe to re-run on a fresh project."
  echo "-- ============================================================"
  echo

  for f in $(ls "$MIG_DIR"/*.sql | sort); do
    name="$(basename "$f")"
    echo
    echo "-- ────────────────────────────────────────────────────────────"
    echo "-- $name"
    echo "-- ────────────────────────────────────────────────────────────"
    cat "$f"
  done
} > "$OUT"

bytes=$(wc -c < "$OUT")
files=$(ls "$MIG_DIR"/*.sql | wc -l)
echo "Wrote $OUT — $files migrations, $bytes bytes."
