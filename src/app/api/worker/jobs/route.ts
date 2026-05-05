import { NextResponse } from "next/server";
import { requireApiWorker, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/worker/jobs — list jobs where the current worker is assigned.
//   ?status=...  optional status filter
// Workers cannot see other workers' jobs. The .contains() filter does the
// per-row authorisation in the same query (no separate auth check needed
// once this query is in place).
export async function GET(req: Request) {
  const auth = await requireApiWorker();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let q = supabase
    .from("jobs")
    .select("*")
    .contains("assigned_worker_ids", [session.user.id])
    .order("date", { ascending: true, nullsFirst: false })
    .order("scheduled_time", { ascending: true, nullsFirst: false });

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    console.error("[worker/jobs GET]", error);
    return NextResponse.json({ error: "Could not load jobs" }, { status: 500 });
  }
  return NextResponse.json({ jobs: data ?? [] });
}
