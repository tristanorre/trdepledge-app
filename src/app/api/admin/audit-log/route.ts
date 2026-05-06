import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { AUDIT_ACTIONS } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/audit-log
//   ?limit=N           default 100, max 500
//   ?action=<prefix>   e.g. "asset" to filter to just inventory events
//
// Pagination is keyset-style on `timestamp` — pass ?before=<ISO> to get
// entries older than the cursor. Avoids OFFSET pain when the log gets large.
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const before = url.searchParams.get("before");
  const actionPrefix = url.searchParams.get("action");

  let q = supabase
    .from("audit_log")
    .select(`
      id, timestamp, action, item_id, item_name,
      from_worker_id, to_worker_id, performed_by, note,
      from_worker:from_worker_id ( name, colour ),
      to_worker:to_worker_id     ( name, colour ),
      performer:performed_by     ( name )
    `)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (before) q = q.lt("timestamp", before);
  if (actionPrefix) {
    // Allowlist against the known vocabulary OR the table's stable
    // top-level prefixes. Stops admins (or anyone with admin auth) from
    // crafting pathological LIKE patterns against the log.
    const knownPrefixes = new Set(AUDIT_ACTIONS as readonly string[]);
    knownPrefixes.add("asset");
    if (knownPrefixes.has(actionPrefix)) {
      q = q.like("action", `${actionPrefix}%`);
    }
  }

  const { data, error } = await q;
  if (error) {
    console.error("[audit-log GET]", error);
    return NextResponse.json({ error: "Could not load audit log" }, { status: 500 });
  }
  return NextResponse.json({ entries: data ?? [] });
}
