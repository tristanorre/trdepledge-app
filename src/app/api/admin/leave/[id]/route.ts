import { NextResponse } from "next/server";
import { requireApiAdmin, requireSupabase } from "@/lib/api-auth";
import { sendPush } from "@/lib/onesignal";
import { after } from "@/lib/after";

export const runtime = "nodejs";

// PATCH approve/decline a leave request.
//   Body: { status: "approved" | "declined" }
//
// On approval, increment the relevant leave_balances counter so the
// worker's remaining days reflect the time off. We use the request's
// from_date year as the bucket (a Dec→Jan straddle is rare for our
// team; if it happens we'd want to split — not handled here).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin();
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  const supabase = requireSupabase();
  if (supabase instanceof NextResponse) return supabase;

  let body: { status?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const status = body.status;
  if (status !== "approved" && status !== "declined") {
    return NextResponse.json({ error: "status must be 'approved' or 'declined'" }, { status: 400 });
  }

  const { data: request, error: readErr } = await supabase
    .from("leave_requests")
    .select("id, worker_id, type, from_date, to_date, status")
    .eq("id", params.id)
    .maybeSingle();

  if (readErr || !request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request already actioned" }, { status: 409 });
  }

  const { error: updateErr } = await supabase
    .from("leave_requests")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.user.id,
    })
    .eq("id", params.id);

  if (updateErr) {
    console.error("[admin/leave PATCH]", updateErr);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }

  // Update the running tally on approval. Work-day counting (skip
  // weekends/public holidays) is more involved than we need here —
  // the simple inclusive day count is what the spec implies and
  // matches how small businesses usually run leave.
  if (status === "approved") {
    const days = workdaysBetweenInclusive(request.from_date, request.to_date);
    // Parse the YYYY-MM-DD as local — `new Date("2026-01-01")` is UTC
    // midnight which can resolve to the previous calendar day in
    // Adelaide, putting the leave under the wrong year.
    const year = Number(request.from_date.slice(0, 4));
    const balanceCol =
      request.type === "Annual Leave"   ? "annual_used"
    : request.type === "Sick Leave"     ? "sick_used"
    : request.type === "Personal Leave" ? "personal_used"
    : null; // Unpaid leave doesn't draw down a counter

    if (balanceCol) {
      // Atomic upsert via RPC — see migration 0015. The previous
      // read-modify-write would lose concurrent approvals (admin A
      // approves request 1, admin B approves request 2; both read the
      // same `current`, both write `current + days`, the second
      // approval's days are silently dropped). Single admin today, but
      // the cost of the fix is one SQL function and zero extra
      // round-trips, so worth doing now.
      const { error: rpcErr } = await supabase.rpc("increment_leave_balance", {
        p_worker_id: request.worker_id,
        p_year: year,
        p_column: balanceCol,
        p_days: days,
      });
      if (rpcErr) {
        console.error("[admin/leave PATCH] increment_leave_balance", rpcErr);
        // Don't fail the whole request — the leave is approved on the
        // requests row, the balance counter is just out of sync. Log
        // loud and move on.
      }
    }
  }

  // Push the worker so they see the decision without polling the app.
  // Registered through `after()` so the function instance stays alive
  // long enough for OneSignal to deliver after we return 200.
  after(sendPush({
    user_ids: [request.worker_id],
    title: status === "approved" ? "Leave approved" : "Leave declined",
    message: `${request.type} · ${request.from_date} → ${request.to_date}`,
    deep_link: "/worker/leave",
  }, supabase));

  return NextResponse.json({ ok: true });
}

// Counts business days only (skip Saturday + Sunday). Public holidays
// would need a holidays table or external API and are deferred — this
// covers the common case and aligns with AU Fair Work expectations
// for accruing/burning paid annual leave at 4 weeks (20 working days)
// per year.
function workdaysBetweenInclusive(from: string, to: string): number {
  const start = new Date(from + "T00:00:00");
  const end   = new Date(to   + "T00:00:00");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 1;
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, count);
}
