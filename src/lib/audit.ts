import type { SupabaseClient } from "@supabase/supabase-js";

// Stable action vocabulary. Anything that changes asset state writes
// one of these. Keep this list small — the colour map in the UI cares
// about each one. New action types need a UI update too.
export const AUDIT_ACTIONS = [
  "asset.created",
  "asset.assigned",
  "asset.reassigned",
  "asset.returned",
  "asset.condition_changed",
  "asset.notes_changed",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEntryInput = {
  action: AuditAction;
  item_id: string;
  item_name: string;
  from_worker_id?: string | null;
  to_worker_id?: string | null;
  performed_by: string;
  note?: string | null;
};

/**
 * Inserts a row into public.audit_log. The table is append-only at the
 * DB level (BEFORE UPDATE/DELETE triggers in migration 0005); this helper
 * is the only path the app uses to write entries, so all log lines pass
 * through one funnel and the schema/colour mapping stays in sync.
 *
 * Returns true on success, false on failure. We deliberately do NOT throw —
 * the caller has typically just made the user-visible mutation and we
 * want the audit log to be best-effort: missing an entry is bad, but
 * blocking the operation entirely is worse. Failures are logged.
 */
export async function writeAuditEntry(
  supabase: SupabaseClient,
  entry: AuditEntryInput,
): Promise<boolean> {
  const { error } = await supabase.from("audit_log").insert({
    action: entry.action,
    item_id: entry.item_id,
    item_name: entry.item_name,
    from_worker_id: entry.from_worker_id ?? null,
    to_worker_id: entry.to_worker_id ?? null,
    performed_by: entry.performed_by,
    note: entry.note ?? null,
  });
  if (error) {
    console.error("[audit] write failed", { entry, error });
    return false;
  }
  return true;
}
