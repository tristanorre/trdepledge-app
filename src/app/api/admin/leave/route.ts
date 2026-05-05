import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/leave?status=pending|approved|declined|all
//   Returns leave requests joined with the worker's name + colour for display.
export async function GET(req: Request) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";

  let q = supabase
    .from("leave_requests")
    .select(`
      id, worker_id, type, from_date, to_date, reason,
      status, submitted_at, reviewed_at, reviewed_by,
      worker:worker_id ( name, colour )
    `)
    .order("submitted_at", { ascending: false });

  if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    console.error("[admin/leave GET]", error);
    return NextResponse.json({ error: "Could not load leave requests" }, { status: 500 });
  }
  return NextResponse.json({ requests: data ?? [] });
}
